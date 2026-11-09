import Example from '../examples/Accordion';
import { ToastProvider } from '@/components/ui/toast';

export default function ComponentDemo() {
  return <div className="nola-component-demo"><Example /><ToastProvider /></div>;
}
