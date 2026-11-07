import Example from '../examples/UndoToast';
import { ToastProvider } from '@/components/ui/toast';
import '../demo.css';

export default function ComponentDemo() {
  return <div className="nola-component-demo"><Example /><ToastProvider /></div>;
}
