import { tokens } from "@/lib/shared";
export function ThemeTokens() {
  return (
    <style>{`:root{--shared-radius-card:${tokens.radius.card}px;--font-body:${tokens.fontSize.body}px;--font-title:${tokens.fontSize.title}px}`}</style>
  );
}
