"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, PageHeader, Panel, Tabs } from "@/components/admin/ui/kit";
import { PlanDetailsTab } from "./PlanDetailsTab";
import { PlanLessonsTab } from "./PlanLessonsTab";
import { PlanLinksTab } from "./PlanLinksTab";
import { PlanCodesTab } from "./PlanCodesTab";
import { PlanContentTab } from "./PlanContentTab";

type EditorTab = "details" | "links" | "lessons" | "content" | "codes";

interface PlanEditorProps {
  planId: string;
  onBack: () => void;
}

export function PlanEditor({ planId, onBack }: PlanEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("details");

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={onBack} className="self-start">
        كل الخطط
      </Button>
      <PageHeader title="إدارة الخطة" description="التفاصيل، الكورسات المرتبطة، بنية الدروس، بناء المحتوى، وأكواد الاشتراك." />
      <Tabs<EditorTab>
        label="أقسام الخطة"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { id: "details", label: "التفاصيل" },
          { id: "links", label: "ربط الكورسات" },
          { id: "lessons", label: "بنية الدروس" },
          { id: "content", label: "بناء المحتوى" },
          { id: "codes", label: "أكواد الاشتراك" },
        ]}
      />
      <Panel clip={false}>
        {activeTab === "details" && <PlanDetailsTab planId={planId} onDelete={onBack} />}
        {activeTab === "links" && <PlanLinksTab planId={planId} />}
        {activeTab === "lessons" && <PlanLessonsTab planId={planId} />}
        {activeTab === "content" && <PlanContentTab planId={planId} />}
        {activeTab === "codes" && <PlanCodesTab planId={planId} />}
      </Panel>
    </div>
  );
}
