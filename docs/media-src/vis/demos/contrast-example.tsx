import Example from '../examples/Contrast';
import { ToastProvider } from '@/components/ui/toast';

export default function ComponentDemo() {
  return <div className="nola-component-demo"><Example /><ToastProvider /></div>;
}
