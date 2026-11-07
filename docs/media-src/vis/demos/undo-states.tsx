import { UndoExample } from '../figures/StayExamples';
import { ToastProvider } from '@/components/ui/toast';
import '../demo.css';

export default function UndoStatesDemo() {
  return <div className="nola-component-demo"><UndoExample /><ToastProvider /></div>;
}
