export function TypographyDemo() {
  return (
    <div>
      <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight text-balance">
        笑声征税：笑话税编年史
      </h1>
      <p className="text-xl leading-7 text-muted-foreground [&:not(:first-child)]:mt-6">
        从前，在遥远的国度里有一位懒惰的国王，整天躺在王座上。有一天，大臣们带来一个难题：王国的财库快要空了。
      </p>
      <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
        国王的计划
      </h2>
      <p className="leading-7 [&:not(:first-child)]:mt-6">
        国王冥思苦想，终于想出了{" "}
        <a
          href="#"
          className="font-medium text-primary underline underline-offset-4"
        >
          一个绝妙的计划
        </a>
        ：他要对王国里的笑话征税。
      </p>
      <blockquote className="mt-6 border-l-2 pl-6 italic">
        “说到底，”他说，“大家都爱听笑话，所以让他们为这份乐趣付费也很公平。”
      </blockquote>
      <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
        笑话税
      </h3>
      <p className="leading-7 [&:not(:first-child)]:mt-6">
        国王的臣民并不觉得有趣。他们抱怨连连，但国王态度坚决：
      </p>
      <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
        <li>双关语第一级：5 枚金币</li>
        <li>笑话第二级：10 枚金币</li>
        <li>单句笑话第三级：20 枚金币</li>
      </ul>
      <p className="leading-7 [&:not(:first-child)]:mt-6">
        结果，人们不再讲笑话，王国笼罩在阴郁之中。但有一个人没有被国王的愚行打倒，他就是宫廷弄臣 Jokester。
      </p>
      <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
        Jokester 的反抗
      </h3>
      <p className="leading-7 [&:not(:first-child)]:mt-6">
        Jokester 开始在深夜偷偷溜进城堡，到处留下笑话：国王的枕头下、汤里，甚至王室厕所里。国王怒不可遏，却始终抓不住 Jokester。
      </p>
      <p className="leading-7 [&:not(:first-child)]:mt-6">
        后来有一天，王国的子民发现 Jokester 留下的笑话实在太有趣，大家忍不住笑了起来，而且一发不可收拾。
      </p>
      <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">
        民众的反抗
      </h3>
      <p className="leading-7 [&:not(:first-child)]:mt-6">
        王国的子民受到欢笑鼓舞，重新开始讲笑话和双关语，很快整个王国都沉浸在笑声中。
      </p>
      <div className="my-6 w-full overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="m-0 border-t p-0 even:bg-muted">
              <th className="border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right">
                国王的宝库
              </th>
              <th className="border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right">
                民众的幸福感
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="m-0 border-t p-0 even:bg-muted">
              <td className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right">
                空状态
              </td>
              <td className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right">
                溢出
              </td>
            </tr>
            <tr className="m-0 border-t p-0 even:bg-muted">
              <td className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right">
                适中
              </td>
              <td className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right">
                满意
              </td>
            </tr>
            <tr className="m-0 border-t p-0 even:bg-muted">
              <td className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right">
                完整
              </td>
              <td className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right">
                欣喜
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="leading-7 [&:not(:first-child)]:mt-6">
        国王看到臣民快乐了许多，意识到自己错了，于是废除了笑话税。Jokester 被尊为英雄，王国从此幸福地生活下去。
      </p>
      <p className="leading-7 [&:not(:first-child)]:mt-6">
        故事告诉我们：不要低估欢笑的力量，也要警惕糟糕的主意。
      </p>
    </div>
  )
}
