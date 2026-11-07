import { DirectionProvider } from '@base-ui/react/direction-provider'
import { IconAlertCircle } from '@tabler/icons-react'
import { LanguageProvider, LanguageSelector, useLanguageContext } from './components/language-selector'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Separator } from './ui/separator'

function DirectionalExample({ Example }) {
  const { language, setLanguage } = useLanguageContext()
  const direction = language === 'en' ? 'ltr' : 'rtl'
  return (
    <>
      <div
        data-slot="rtl-preview-toolbar"
        className="flex h-16 w-full items-center justify-between border-b px-4"
        dir="ltr"
      >
        <LanguageSelector value={language} onValueChange={setLanguage} />
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="RTL 示例说明">
                <IconAlertCircle />
              </Button>
            }
          />
          <PopoverContent
            side="bottom"
            align="end"
            dir="ltr"
            className="w-56 text-xs"
            aria-label="RTL 示例说明"
          >
            <p lang="zh-CN">译文用于演示从右到左的布局，可能存在误差。</p>
            <Separator />
            <p lang="ar" dir="rtl">تُستخدم الترجمات لعرض التخطيط من اليمين إلى اليسار، وقد تحتوي على أخطاء.</p>
            <Separator />
            <p lang="he" dir="rtl">התרגומים נועדו להדגים פריסה מימין לשמאל וייתכן שיש בהם שגיאות.</p>
          </PopoverContent>
        </Popover>
      </div>
      <div
        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center p-4 sm:p-10"
        dir={direction}
        lang={language}
      >
        <DirectionProvider direction={direction}>
          <Example />
        </DirectionProvider>
      </div>
    </>
  )
}

export function withRtlExample(Example) {
  return function RtlExample() {
    return <LanguageProvider><DirectionalExample Example={Example} /></LanguageProvider>
  }
}
