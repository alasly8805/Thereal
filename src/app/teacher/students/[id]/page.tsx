import { TeacherStudentReportPage } from "@/components/teacher/TeacherStudentsPages";

export default async function TeacherStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TeacherStudentReportPage studentId={id} />;
}
