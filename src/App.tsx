import { useAppStore } from "@/stores/appStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { ConverterPage } from "@/pages/ConverterPage";
import { PdfMergePage } from "@/pages/PdfMergePage";
import { PdfSignaturePage } from "@/pages/PdfSignaturePage";
import { PdfToolkitPage } from "@/pages/PdfToolkitPage";
import { OcrPage } from "@/pages/OcrPage";
import { Toaster } from "@/components/ui/sonner";

const PAGES = {
  converter: ConverterPage,
  pdfMerge: PdfMergePage,
  pdfSignature: PdfSignaturePage,
  pdfToolkit: PdfToolkitPage,
  ocr: OcrPage,
} as const;

function App() {
  const currentView = useAppStore((s) => s.currentView);
  const Page = PAGES[currentView];

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Page />
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
