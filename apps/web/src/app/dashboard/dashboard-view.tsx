"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CopyValue } from "@/components/copy";
import { Fillers } from "@/components/fillers";
import { BrandLogo } from "@/components/brand-logo";
import { Field, Notice, PageTitle, SelectField, SignInPanel, Spinner, TextareaField, Tile, Tiles } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, useApi } from "@/lib/api";
import { usd } from "@/lib/format";
import { CATEGORIES, hostOf, type Company } from "@/lib/profile";
import { AppDetail } from "./app-detail";
import { CompanyForm } from "./company-form";
import type { MyApp } from "./types";

/** /dashboard lists the company's apps; /dashboard?app=0x... opens one. */
export function DashboardView() {
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const api = useApi();
  const params = useSearchParams();
  const selected = params.get("app");

  const [apps, setApps] = useState<MyApp[]>();
  /** undefined while loading, null when the owner hasn't set one up yet. */
  const [company, setCompany] = useState<Company | null>();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();

  const reload = useCallback(() => api<MyApp[]>("GET", "/v1/me/apps").then(setApps, (e: Error) => setError(e.message)), [api]);

  useEffect(() => {
    if (!identityToken) return;
    let live = true;
    Promise.all([
      api<MyApp[]>("GET", "/v1/me/apps"),
      api<Company>("GET", "/v1/me/company").catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    ]).then(
      ([a, c]) => live && (setApps(a), setCompany(c)),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [api, identityToken]);

  if (ready && !authenticated) {
    return (
      <>
        <PageTitle title="Take credits in your app." lead="Register your app, set prices in credits, and withdraw what your users spend in USDT on Whitechain." />
        <SignInPanel title="Sign in to manage your apps." lead="Use your work email. Earnings are paid in USDT to your own wallet, or to any address you choose when you register an app." />
      </>
    );
  }

  const app = selected ? apps?.find((a) => a.id.toLowerCase() === selected.toLowerCase()) : undefined;
  if (selected && apps && app) return <AppDetail app={app} onChange={reload} />;

  if (company === null) {
    return (
      <>
        <PageTitle title="Set up your company." lead="Tell users who they're paying. This shows in the ecosystem and on the connect page. You can change it any time." />
        {error && (
          <Tile>
            <Notice tone="error">{error}</Notice>
          </Tile>
        )}
        <Tile className="lg:px-16">
          <CompanyForm
            onSaved={(c) => {
              setCompany(c);
              void reload();
            }}
          />
        </Tile>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Your apps." lead="Each app gets its own API keys, price list and earnings. The network pays the gas for every transaction." />
      {company && (
        <section className="border-b border-wc-border-light px-6 py-8 sm:px-8 lg:px-16">
          {editing ? (
            <CompanyForm
              company={company}
              onSaved={(c) => {
                setCompany(c);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <BrandLogo src={company.logoUrl} name={company.name} />
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-semibold text-wc-text-1">{company.name}</p>
                <p className="mt-0.5 text-[14px] text-wc-text-muted">
                  {[company.category && CATEGORIES[company.category], company.website && hostOf(company.website), company.supportEmail].filter(Boolean).join(" · ") || "Add a website and support email so users know who you are."}
                </p>
              </div>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit company
              </Button>
            </div>
          )}
        </section>
      )}
      {error && (
        <Tile>
          <Notice tone="error">{error}</Notice>
        </Tile>
      )}
      {!apps && !error && (
        <Tile>
          <div className="h-12 w-72 animate-pulse rounded-control bg-wc-surface-2" />
        </Tile>
      )}
      {apps && (
        <Tiles className={apps.length ? "md:grid-cols-2 lg:grid-cols-3" : ""}>
          {apps.map((a) => (
            <Link key={a.id} href={`/dashboard?app=${a.id}`} className="group flex flex-col bg-wc-surface px-6 py-10 transition-colors hover:bg-wc-bg sm:px-8 lg:px-12">
              <div className="flex items-center gap-3">
                <BrandLogo src={a.logoUrl} name={a.name} className="size-9 rounded-[10px] text-[15px]" />
                <span className="flex-1 truncate text-[18px] leading-[27px] font-semibold text-black">{a.name}</span>
                <ArrowUpRight className="size-[15px] text-wc-icon-muted transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-wc-blue" />
              </div>
              <p className="mt-3 text-[15px] text-wc-text-muted">
                {usd(a.unpaidEarnings)} ready to withdraw · {Object.keys(a.prices).length} prices
              </p>
            </Link>
          ))}
          <CreateApp onCreated={reload} />
          {apps.length > 0 && <Fillers count={apps.length + 1} />}
        </Tiles>
      )}
    </>
  );
}

function CreateApp({ onCreated }: { onCreated: () => void }) {
  const api = useApi();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [payout, setPayout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [made, setMade] = useState<{ id: string; name: string; apiKey: string; explorer?: string }>();

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      setMade(await api("POST", "/v1/me/apps", { name: name.trim(), description, category, payout: payout.trim() || undefined }));
      setName("");
      setDescription("");
      setCategory("");
      setPayout("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (made) {
    return (
      <Tile className="lg:px-12">
        <h2 className="text-heading-xl text-wc-text-1">{made.name} is live.</h2>
        <div className="mt-4">
          <Notice>Copy your API key now. It&apos;s shown only once. Keep it on your server.</Notice>
        </div>
        <CopyValue value={made.apiKey} className="mt-4" />
        <div className="mt-6 flex items-center gap-5">
          <Link href={`/dashboard?app=${made.id}`} className="text-[15px] font-medium text-wc-blue hover:underline">
            Set prices
          </Link>
          <button type="button" className="text-[15px] font-medium text-wc-text-muted hover:text-wc-navy" onClick={() => setMade(undefined)}>
            Register another
          </button>
        </div>
      </Tile>
    );
  }

  return (
    <Tile className="lg:px-12">
      <h2 className="text-heading-xl text-wc-text-1">Register an app.</h2>
      <p className="mt-2 text-[15px] leading-6 text-wc-text-muted">Registered onchain in a few seconds. Free: the network pays the gas.</p>
      <div className="mt-6 max-w-md space-y-5">
        <Field label="App name" placeholder="Your app" value={name} onChange={(e) => setName(e.target.value)} />
        <TextareaField label="What it does" placeholder="One or two sentences for the ecosystem page." maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} />
        <SelectField label="Category" value={category} onChange={setCategory} options={CATEGORIES} hint="Defaults to your company's." />
        <Field label="Payout address" placeholder="Your wallet, by default" value={payout} onChange={(e) => setPayout(e.target.value)} hint="Where your USDT earnings go on Whitechain." />
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy || name.trim().length < 2} onClick={create}>
          {busy && <Spinner />}
          {busy ? "Registering" : "Register app"}
        </Button>
      </div>
    </Tile>
  );
}
