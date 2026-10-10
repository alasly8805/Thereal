"use client";

import { useState } from "react";
import { BookOpen, ClipboardCheck, Unlink } from "lucide-react";
import { PageHeader, Tabs } from "@/components/admin/ui/kit";
import { PlanList } from "./plans/PlanList";
import { PlanEditor } from "./plans/PlanEditor";
import { UnmatchedQueue } from "./plans/UnmatchedQueue";
import { GradingQueue } from "./plans/GradingQueue";

type PlansTab = "list" | "unmatched" | "grading";

export function PlansSection({ userRole: _userRole }: { userRole: "superadmin" | "admin" | "staff" }) {
  const [activeTab, setActiveTab] = useState<PlansTab>("list");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  if (selectedPlanId) {
    return <PlanEditor planId={selectedPlanId} onBack={() => setSelectedPlanId(null)} />;
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="الخطط الدراسية"
        description="خطط تجمع دروس عدة معلمين في مسار واحد باشتراك وأكواد خاصة. راجع الفيديوهات التي لم تُطابق درساً، وقيّم مشاريع الطلاب."
      />
      <Tabs<PlansTab>
        label="أقسام الخطط"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { id: "list", label: "الخطط", icon: <BookOpen size={15} /> },
          { id: "unmatched", label: "محتوى غير مطابق", icon: <Unlink size={15} /> },
          { id: "grading", label: "مشاريع للتقييم", icon: <ClipboardCheck size={15} /> },
        ]}
      />
      {activeTab === "list" && <PlanList onSelectPlan={setSelectedPlanId} />}
      {activeTab === "unmatched" && <UnmatchedQueue />}
      {activeTab === "grading" && <GradingQueue />}
    </div>
  );
}
