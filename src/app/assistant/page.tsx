import { getPatients } from '@/app/actions';
import DoctorDashboard from '@/components/doctor/DoctorDashboard';

export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const patients = await getPatients();
  return <DoctorDashboard initialPatients={patients} />;
}

