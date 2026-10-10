import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { awardDailyExamPoints } from "@/lib/points";
import { Clock, Target, CheckCircle } from "lucide-react";
import { WatermarkedText } from "@/components/content/WatermarkedText";

export default async function StudentDailyExamPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession({ preferStudent: true });
  if (!session) redirect("/login");

  const resolvedParams = await params;
  const exam = await prisma.dailyExam.findUnique({
    where: { id: resolvedParams.id },
    include: { questions: { orderBy: { order: "asc" } } }
  });

  if (!exam || !exam.isActive) return notFound();

  // Check if already completed
  const existingResult = await prisma.dailyExamResult.findUnique({
    where: {
      studentId_examId: { studentId: session.id, examId: exam.id }
    }
  });

  if (existingResult) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar user={{ name: session.name, role: session.role }} />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-md w-full">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">لقد أكملت هذا التحدي مسبقاً!</h1>
            <p className="text-slate-600 mb-6">لقد حصلت على درجة {existingResult.score} من {existingResult.totalQ}.</p>
            <a href="/leaderboard" className="block w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition">
              العودة للوحة الشرف
            </a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  async function submitExam(formData: FormData) {
    "use server";
    
    const questions = exam?.questions ?? [];
    const score = questions.filter((q) => formData.get(`q_${q.id}`) === q.correctAnswer).length;
    const totalQ = questions.length;

    // Save result
    await prisma.dailyExamResult.create({
      data: {
        studentId: session!.id,
        examId: exam!.id,
        score,
        totalQ,
      }
    });

    // Award points
    await awardDailyExamPoints(session!.id, score, totalQ);

    redirect("/leaderboard");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar user={{ name: session.name, role: session.role }} />
      
      <main className="flex-1 max-w-3xl mx-auto w-full p-4 md:p-8">
        
        <div className="bg-amber-500 rounded-t-2xl p-6 text-white text-center">
          <Target className="w-12 h-12 mx-auto mb-2 opacity-80" />
          <h1 className="text-3xl font-bold mb-2"><WatermarkedText text={exam.title} /></h1>
          <div className="flex items-center justify-center gap-2 text-amber-100">
            <Clock className="w-5 h-5" />
            <span>المدة المحددة: {exam.timeLimitMinutes} دقيقة</span>
          </div>
        </div>

        <div className="bg-white rounded-b-2xl shadow-sm border border-slate-200 border-t-0 p-6 md:p-8">
          <form action={submitExam} className="space-y-8">
            
            {exam.questions.map((q, i) => (
              <div key={q.id} className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800 border-b pb-4">
                  <span className="text-amber-500 ml-2">{i + 1}.</span> 
                  <WatermarkedText text={q.question} />
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['A', 'B', 'C', 'D'].map((opt) => (
                    <label 
                      key={opt}
                      className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500"
                    >
                      <input 
                        type="radio" 
                        name={`q_${q.id}`} 
                        value={opt} 
                        required
                        className="w-5 h-5 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-slate-700 font-medium">
                        <WatermarkedText text={String(q[`option${opt}` as keyof typeof q] ?? "")} />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="pt-6 border-t border-slate-100">
              <button 
                type="submit" 
                className="w-full py-4 bg-blue-600 text-white font-bold text-lg rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200"
              >
                تسليم الإجابات وإنهاء التحدي
              </button>
            </div>
            
          </form>
        </div>
        
      </main>
      
      <Footer />
    </div>
  );
}
