import Example from '../examples/ContentStates';
import { ToastProvider } from '@/components/ui/toast';
import '../shadcn-base/apple-liquid-glass.css';
import '../shadcn-base/nola-liquid-glass.css';

export default function ComponentDemo() {
  return <div className="nola-component-demo"><Example /><ToastProvider /></div>;
}
