"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";
import { faqId } from "./faq";

// Job 9: ask in your own words; AI assist opens the matching answer on this page.
// "I don't know" is a normal outcome: it then points to Who to ask.
export function HelpAsk() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await sendJson("/api/ai/help", { method: "POST", body: { question } });
    setBusy(false);
    const q = res.ok ? (res.body.q as string | null) : null;
    const el = q ? document.getElementById(faqId(q)) : null;
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.querySelector("summary")?.focus();
      setMessage(`Opened: “${q}”`);
    } else {
      setMessage(
        res.ok
          ? "I don't know that one. Look through the answers below, or ask someone under Who to ask."
          : res.error
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand-700" aria-hidden="true" />
          Ask in your own words
        </CardTitle>
        <CardDescription>
          AI assist finds the matching answer on this page. Your question is sent to the AI service;
          don&apos;t include personal details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <form onSubmit={ask} className="flex gap-2">
          <label htmlFor="help-question" className="sr-only">
            Your question
          </label>
          <Input
            id="help-question"
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. paano ko ipapasa ang weekly report?"
          />
          <Button type="submit" disabled={busy} className="cursor-pointer">
            {busy ? "Looking..." : "Ask"}
          </Button>
        </form>
        {message && (
          <p role="status" className="text-sm text-foreground/85">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
