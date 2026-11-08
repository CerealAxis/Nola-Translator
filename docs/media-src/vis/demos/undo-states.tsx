import { UndoExample } from '../figures/StayExamples';
import { ToastProvider } from '@/components/ui/toast';
import '../shadcn-base/apple-liquid-glass.css';
import '../shadcn-base/nola-liquid-glass.css';

export default function UndoStatesDemo() {
  return <div className="nola-component-demo"><UndoExample /><ToastProvider /></div>;
}
