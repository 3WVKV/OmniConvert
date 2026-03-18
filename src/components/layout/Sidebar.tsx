import { useTranslation } from "react-i18next";
import { useAppStore, type AppView } from "@/stores/appStore";
import {
  ArrowLeftRight,
  Merge,
  PenTool,
  Wrench,
  ScanText,
  Sun,
  Moon,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";

const NAV_ITEMS: { key: AppView; icon: typeof ArrowLeftRight; translationKey: string }[] = [
  { key: "converter", icon: ArrowLeftRight, translationKey: "nav.converter" },
  { key: "pdfMerge", icon: Merge, translationKey: "nav.pdfMerge" },
  { key: "pdfSignature", icon: PenTool, translationKey: "nav.pdfSignature" },
  { key: "pdfToolkit", icon: Wrench, translationKey: "nav.pdfToolkit" },
  { key: "ocr", icon: ScanText, translationKey: "nav.ocr" },
];

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const { currentView, setView } = useAppStore();
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
    else if (saved === "light") setDark(false);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setDark(true);
  }, []);

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === "fr" ? "en" : "fr");
  };

  return (
    <TooltipProvider delay={300}>
      <aside className="flex h-full w-16 flex-col items-center border-r border-border bg-sidebar py-4 gap-2">
        <div className="mb-2 text-xs font-bold text-sidebar-primary tracking-wider">OC</div>
        <Separator className="w-8 mb-2" />

        <nav className="flex flex-1 flex-col items-center gap-1">
          {NAV_ITEMS.map(({ key, icon: Icon, translationKey }) => (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <Button
                    variant={currentView === key ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setView(key)}
                    className="h-10 w-10"
                  >
                    <Icon className="h-5 w-5" />
                  </Button>
                }
              />
              <TooltipContent side="right">{t(translationKey)}</TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <Separator className="w-8 mb-2" />

        <div className="flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="h-10 w-10">
                  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              }
            />
            <TooltipContent side="right">{t("common.theme")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" onClick={toggleLang} className="h-10 w-10">
                  <Languages className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipContent side="right">
              {i18n.language === "fr" ? "English" : "Français"}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
