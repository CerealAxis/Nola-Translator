import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const segments = [
  { time: '00:04', en: 'The meeting starts at nine.', ar: 'يبدأ الاجتماع في الساعة التاسعة.', translation: '会议九点开始。' },
  { time: '00:11', en: 'I’ll send you the agenda this afternoon.', ar: 'سأرسل لك جدول الأعمال بعد ظهر اليوم.', translation: '我今天下午把议程发给你。' },
  { time: '00:18', en: 'Please leave ten minutes for questions.', ar: 'يرجى تخصيص عشر دقائق للأسئلة.', translation: '请留十分钟给大家提问。' },
];

export default function Transcript() {
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [bilingual, setBilingual] = useState(true);

  return (
    <div className="vis-example">
      <Card className="vis-example__card">
        <CardHeader><CardTitle>会议记录</CardTitle></CardHeader>
        <CardContent>
          <div className="vis-transcript__toolbar">
            <Select value={language} onValueChange={value => {
              if (value === 'en' || value === 'ar') setLanguage(value);
            }}>
              <SelectTrigger aria-label="语言方向"><SelectValue>{language === 'en' ? '英语' : '阿拉伯语'} → 简体中文</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">英语 → 简体中文</SelectItem>
                <SelectItem value="ar">阿拉伯语 → 简体中文</SelectItem>
              </SelectContent>
            </Select>
            <ToggleGroup aria-label="显示内容" value={[bilingual ? 'both' : 'translation']} onValueChange={([value]) => {
              if (value) setBilingual(value === 'both');
            }}>
              <ToggleGroupItem value="both">双语</ToggleGroupItem>
              <ToggleGroupItem value="translation">仅译文</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <ol className="vis-transcript__segments" aria-label="会议片段">
            {segments.map(segment => (
              <li key={segment.time}>
                <span className="vis-transcript__time" dir="ltr">{segment.time}</span>
                <div>
                  {bilingual && <p lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>{segment[language]}</p>}
                  <p lang="zh-CN" dir="ltr">{segment.translation}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
