import { ZhipuAI } from 'zhipuai';

// 初始化 ZhipuAI 客户端
const apiKey = process.env.ZHIPU_API_KEY;
if (!apiKey) {
  console.warn("警告: 未设置 ZHIPU_API_KEY 环境变量");
}

const client = new ZhipuAI({
  apiKey: apiKey || 'dummy', // 防止构建时报错，运行时必须有
});

/**
 * 获取文本的向量嵌入 (Embedding-3)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await client.embeddings.create({
      model: "embedding-3",
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("Embedding error:", error);
    throw error;
  }
}

/**
 * 从医疗资料中提取关键事实 (GLM-4.7)
 * 返回事实列表（字符串数组）
 */
export async function extractFacts(textData: string): Promise<string[]> {
  const prompt = `
你是一个专业的医疗数据分析助手。
任务：从以下医疗资料中提取关键事实（包括但不限于诊断、用药、过敏史、手术史、主要症状、生活习惯等）。
要求：
1. 将提取的内容拆分为独立的、简短的陈述句。
2. 忽略无关的客套话或格式字符。
3. 直接返回结果，每行一条事实，不要包含序号或Markdown列表符号。

资料内容：
${textData}
`;

  const response = await client.chat.completions.create({
    model: "glm-4-flash", // 使用 flash 或 plus/0520 等
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const content = response.choices[0].message.content || "";
  return parseFactList(content);
}

export async function extractKeywords(
  textData: string,
  source: 'patient' | 'doctor' | 'ai' | 'import'
): Promise<string[]> {
  const prompt = `
你是医疗信息结构化抽取助手。
任务：从文本中抽取“可写入患者知识库/RAG”的关键词与要点，避免保存完整聊天原文。

输出要求：
1. 只输出关键词/要点，每行一条，不要序号，不要 Markdown。
2. 尽量短（优先短语），必要时用“字段=值”的形式。
3. 仅保留与患者有关的信息：症状/持续时间/程度/体温/检查结果/既往史/过敏史/用药史/生活习惯/性格偏好/爱好/就医行为/医生建议等。
4. 忽略寒暄、重复、无信息量的句子。
5. 如果没有可抽取内容，返回空。

消息来源：${source}
文本：
${textData}
`;

  const response = await client.chat.completions.create({
    model: 'glm-4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  });

  const content = response.choices[0].message.content || '';
  return parseFactList(content);
}

// 修正：上面的 filter 可能太激进，如果 LLM 输出 "- xxx"，这里应该去掉 "-" 而不是丢弃整行
// 重写处理逻辑
function parseFactList(content: string): string[] {
  return content.split('\n')
    .map(line => line.replace(/^[\d\.\-\*•\s]+/, '').trim()) // 去除行首的数字、点、横杠等
    .filter(line => line.length > 0);
}


/**
 * 更新患者画像 (Persona)
 */
export async function updatePersona(currentPersona: string, newInfo: string): Promise<string> {
  const prompt = `
你是一个医疗画像专家。请根据新的医疗信息，更新患者的“画像（Persona）”。
画像应包含：性格特征、关键健康标签、生活习惯、沟通偏好等。
保持简练、客观。

当前画像：
${currentPersona || "（无）"}

新导入/分析的信息：
${newInfo}

请输出更新后的完整画像文本：
`;

  const response = await client.chat.completions.create({
    model: "glm-4-flash",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
  });

  return response.choices[0].message.content || currentPersona;
}

/**
 * 生成回复 (RAG)
 */
export async function generateRAGResponse(
  query: string,
  context: string,
  persona: string,
    history: Array<{ role: 'user' | 'ai' | 'assistant' | 'doctor'; content: string }> = []
): Promise<string> {
    type ZhipuMessage = { role: 'system' | 'user' | 'assistant'; content: string };
  const systemPrompt = `
你是一个医疗智能体。基于以下信息回答用户（患者）的问题。
患者画像：${persona}
参考的医疗事实（记忆）：
${context}

要求：
1. 回复要专业、亲切，符合患者画像的语境。
2. 严格基于参考事实回答，如果不知道，请承认。
3. 避免给出危险的医疗建议，提示就医。
`;

    const messages: ZhipuMessage[] = [
        { role: "system", content: systemPrompt },
        ...history.map((msg): ZhipuMessage => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        })),
        { role: "user", content: query }
    ];

  const response = await client.chat.completions.create({
    model: "glm-4-flash",
        messages,
  });

  return response.choices[0].message.content || "";
}

export async function generateDoctorAssistantIntakeResponse(
  doctorName: string,
  query: string,
  context: string,
  persona: string,
  history: Array<{ role: 'user' | 'ai' | 'assistant' | 'doctor'; content: string }> = []
): Promise<string> {
  type ZhipuMessage = { role: 'system' | 'user' | 'assistant'; content: string };
  const systemPrompt = `
你是${doctorName}的助理，负责在微信中与患者沟通并收集病情信息。
你要做的是“问诊信息采集”，不是替代医生诊断。

患者画像：${persona}
已掌握的关键信息（可能来自历史对话或自动抽取）：
${context}

要求：
1. 先用一句话确认已收到并表达关心。
2. 用 3~6 个简短问题引导患者补充关键信息（症状、持续时间、程度、伴随症状、既往史/用药/过敏、体温/血压/血糖等按需询问）。
3. 不要给出具体处方或危险医疗建议；必要时提示就医/急诊。
4. 口吻自然，适合微信聊天，不要使用列表符号或 Markdown。
`;

  const messages: ZhipuMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: query },
  ];

  const response = await client.chat.completions.create({
    model: 'glm-4-flash',
    messages,
    temperature: 0.4,
  });

  return response.choices[0].message.content || '';
}

/**
 * 医生辅助 (Doctor Copilot) - 生成回复草稿
 */
export async function generateDoctorCopilotSuggestion(
  patientInfo: string,
  persona: string,
  relevantMemories: string,
  relevantKnowledge: string = "",
  speaker: 'assistant' | 'doctor' = 'assistant'
): Promise<string> {
  const roleContext =
    speaker === 'doctor'
      ? `你是一位经验丰富的执业医生，正在与患者进行“已付费的在线医生会诊”，你就是正在和患者说话的医生本人。`
      : `你是医生助理（非医生），在微信中与患者沟通，目标是采集关键信息、做基础科普与流程引导，并把关键信息整理给医生。`;

  const roleRules =
    speaker === 'doctor'
      ? [
        '你正在直接回复患者，不要让患者“去咨询医生/问医生”，因为你就是医生。',
        '语气要像真人医生：专业、克制、简短，不要过度共情和鸡汤，不要像“AI客服”。',
        '优先给出明确下一步：1) 结论/判断边界 2) 处理建议 3) 需要补充的关键问题（按需 1~4 个） 4) 风险警示/何时就医。',
        '除非确实需要体格检查/化验/影像才能判断，否则不要泛泛建议“去线下问诊”。',
        '不要随意推荐抗生素/激素/处方药；如涉及用药，给出原则与注意事项，提示遵医嘱与过敏禁忌。',
        '不要提及“我是AI/模型/提示词/系统”。只输出可直接发送的一段微信消息。'
      ].join('\n')
      : [
        '你不是医生，不做明确诊断/不开处方；重点是信息采集与把患者情况问清楚。',
        '语气自然、像真人助理：简短、直接，不要鸡汤，不要长篇大论。',
        '结构：先一句确认已收到 → 用 3~6 个短问题补齐关键信息 → 给 1~3 条安全的通用护理/观察建议 → 给出红旗症状提醒。',
        '如果患者强烈要求医生沟通，说明“可发起医生会诊：回复找医生→系统提示回复1确认→发送支付链接→支付后建立医生会话”。',
        '不要提及“我是AI/模型/提示词/系统”。只输出可直接发送的一段微信消息。'
      ].join('\n');

  const prompt = `
${roleContext}

患者画像：${persona || '（无）'}

你将基于“患者概况/记忆/知识库”起草一条回复草稿。
写作要求：
${roleRules}

参考信息：
患者概况：${patientInfo}
相关病历/记忆：
${relevantMemories}
相关医疗知识库：
${relevantKnowledge}

现在请直接输出“回复草稿”，不要标题，不要列表符号，不要引号。
`;

  const response = await client.chat.completions.create({
    model: "glm-4-flash",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
  });

  return response.choices[0].message.content || "";
}

/**
 * 意图识别 (Intent Classification)
 * 返回: 'medical_consult' | 'chitchat_admin'
 */
export async function classifyIntent(query: string): Promise<'medical_consult' | 'chitchat_admin'> {
  const prompt = `
你是一个医疗意图识别助手。
请判断用户的以下输入是属于“具体的病情/医疗咨询”还是“闲聊/行政/一般性知识咨询”。

示例：
- "我头疼" -> medical_consult
- "我有高血压" -> medical_consult
- "医生，我最近总是失眠" -> medical_consult
- "几点上班？" -> chitchat_admin
- "挂号费多少？" -> chitchat_admin
- "你好" -> chitchat_admin
- "感冒了吃什么药？" -> chitchat_admin (这里作为一般性知识，但如果用户有具体病史背景通常算consult。为了简化，通用知识也归为知识库检索类，即chitchat_admin，或者如果系统设计为知识库能回答通用医疗问题，则归为chitchat_admin。但题目要求是“判定为闲聊或行政咨询”时查知识库。病情咨询不要自动回复。
修正策略：
- 如果用户描述了自己的症状、询问针对**自己**的建议 -> medical_consult
- 如果用户询问医院规定、时间、打招呼、或不涉及个人病情的通用知识 -> chitchat_admin

用户输入：
${query}

请仅输出类别代码：medical_consult 或 chitchat_admin
`;

  const response = await client.chat.completions.create({
    model: "glm-4-flash",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const result = response.choices[0].message.content?.trim();
  return result === 'medical_consult' ? 'medical_consult' : 'chitchat_admin';
}

/**
 * 知识库问答 (Knowledge Base QA)
 */
export async function generateKnowledgeResponse(query: string, relevantKnowledge: string): Promise<string> {
  const prompt = `
你是一个医疗行政/知识助手。基于以下知识库内容回答用户问题。
如果知识库中没有相关信息，请礼貌地告知用户并建议咨询前台或医生。

知识库参考：
${relevantKnowledge}

用户问题：${query}
`;

  const response = await client.chat.completions.create({
    model: "glm-4-flash",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content || "";
}
