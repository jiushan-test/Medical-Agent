const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(process.cwd(), 'data', 'local.db'));
db.pragma('foreign_keys = ON');

db.prepare('DELETE FROM doctor_consultations').run();
db.prepare('DELETE FROM memories').run();
db.prepare('DELETE FROM chat_messages').run();
db.prepare('DELETE FROM patients').run();

const intro =
  '您好，我是张医生的助理。我会先帮您把情况记录清楚，方便医生更快了解。请您先说一下：最主要哪里不舒服？从什么时候开始？有没有发烧/咳嗽/疼痛等情况？';

const demos = [
  { name: '李华', age: 28, gender: '男', condition: '咳嗽发热' },
  { name: '王敏', age: 35, gender: '女', condition: '胃痛反酸' },
  { name: '赵强', age: 62, gender: '男', condition: '高血压糖尿病' },
];

const insP = db.prepare('INSERT INTO patients (id, name, age, gender, condition, persona) VALUES (?, ?, ?, ?, ?, ?)');
const insM = db.prepare('INSERT INTO chat_messages (patient_id, role, content) VALUES (?, ?, ?)');

for (const p of demos) {
  const id = `p_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  insP.run(id, p.name, p.age, p.gender, p.condition, '新创建患者，暂无详细画像。');
  insM.run(id, 'ai', intro);
}

console.log('seeded', demos.length);
