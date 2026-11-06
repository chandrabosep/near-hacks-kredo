"use client";

import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Notice } from "@/components/shell";
import { CATEGORIES, hostOf } from "@/lib/profile";
import { CompanyForm } from "../company-form";
import { useDashboard } from "../context";
import { DashHeader, DashSection, Panel } from "../ui";

/** The company profile users see in the ecosystem and on the connect page. */
export function CompanySettings() {
  const { company, setCompany, reload, apps } = useDashboard();
  const [saved, setSaved] = useState(false);

  return (
    <>
      <DashHeader title="Company" lead="Shown to users in the ecosystem and on the connect page, so they know who they're paying." />

      <section className="border-b border-wc-border-light px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="flex items-center gap-4 rounded-[16px] border border-wc-border-light bg-wc-surface p-6">
          <BrandLogo src={company.logoUrl} name={company.name} className="size-14 rounded-[16px] text-[22px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-semibold text-wc-text-1">{company.name}</p>
            <p className="truncate text-[14px] text-wc-text-muted">
              {[company.category && CATEGORIES[company.category], company.website && hostOf(company.website), company.supportEmail].filter(Boolean).join(" · ") || "Add a website and support email"}
            </p>
          </div>
          <p className="hidden text-[13px] text-wc-icon-muted sm:block">
            {apps.length} {apps.length === 1 ? "app" : "apps"}
          </p>
        </div>
      </section>

      <DashSection title="Profile" lead="Leaving a field empty clears it. Apps without their own logo, website or category use these.">
        {saved && (
          <div className="mb-6 max-w-3xl">
            <Notice tone="success">Saved. Users see the new profile right away.</Notice>
          </div>
        )}
        <Panel title="Company profile" lead="Name, category, website, support email and logo.">
        <CompanyForm
          company={company}
          onSaved={(c) => {
            setCompany(c);
            setSaved(true);
            void reload();
          }}
        />
        </Panel>
      </DashSection>
    </>
  );
}
