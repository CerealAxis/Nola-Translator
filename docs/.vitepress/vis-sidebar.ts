import type { DefaultTheme } from 'vitepress'

const article = (text: string, path: string) => ({ text, link: `/vis/${path}` })

export const visSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Nola Translator 设计原则',
    link: '/vis/principles/structure',
    items: [
      article('DESIGN.md', 'DESIGN'),
      {
        text: '设计原则',
        collapsed: true,
        items: [
          article('亲密性', 'principles/structure'),
          article('对齐', 'principles/alignment'),
          article('对比', 'principles/contrast'),
          article('重复', 'principles/repetition'),
          article('直截了当', 'principles/interaction'),
          article('足不出户', 'principles/stay'),
          article('简化交互', 'principles/lightweight'),
          article('提供邀请', 'principles/invitation'),
          article('巧用过渡', 'principles/transition'),
          article('即时反应', 'principles/response'),
        ],
      },
      {
        text: '基础样式',
        collapsed: true,
        items: [
          article('无障碍', 'foundations/accessibility'),
          article('App 图标', 'foundations/app-icons'),
          article('品牌', 'foundations/branding'),
          article('颜色', 'foundations/color'),
          article('深色模式', 'foundations/dark-mode'),
          article('图标', 'foundations/icons'),
          article('图像', 'foundations/images'),
          article('包容性', 'foundations/inclusion'),
          article('布局', 'foundations/layout'),
          article('材质', 'foundations/materials'),
          article('动态效果', 'foundations/motion'),
          article('从右到左', 'foundations/right-to-left'),
          article('字体排印', 'foundations/typography'),
          article('编写', 'foundations/writing'),
        ],
      },
      {
        text: '布局与导航',
        collapsed: true,
        items: [
          article('窗口布局', 'layout/windows'),
          article('列表与表格', 'layout/structure'),
          article('导航路径', 'layout/paths'),
          article('层级与浮层', 'layout/layers'),
        ],
      },
      {
        text: '组件与反馈',
        collapsed: true,
        items: [
          {
            text: '操作与输入',
            items: [
              article('按钮', 'components/actions'),
              article('按钮组合', 'components/button-group'),
              article('字幕方案', 'components/inputs'),
              article('表单字段', 'components/field'),
              article('单行输入', 'components/input'),
              article('多行输入', 'components/textarea'),
              article('单选列表', 'components/select'),
              article('可搜索选择', 'components/combobox'),
              article('即时开关', 'components/switch'),
              article('滑块', 'components/slider'),
              article('操作菜单', 'components/dropdown-menu'),
            ],
          },
          {
            text: '内容与展开',
            items: [
              article('表格', 'components/content'),
              article('数据表', 'components/data-table'),
              article('空状态', 'components/empty'),
              article('折叠组', 'components/overlays'),
              article('局部展开', 'components/collapsible'),
            ],
          },
          {
            text: '反馈与浮层',
            items: [
              article('操作反馈', 'components/feedback'),
              article('轻提示', 'components/toast'),
              article('文字提示', 'components/tooltip'),
              article('浮层详情', 'components/popover'),
              article('对话框', 'components/dialog'),
              article('危险确认', 'components/alert-dialog'),
              article('侧边面板', 'components/sheet'),
            ],
          },
          {
            text: '工作台',
            items: [
              article('对话流', 'components/workbench'),
              article('工具轨迹', 'components/trace'),
              article('工具批准', 'components/confirmation'),
            ],
          },
        ],
      },
      {
        text: '文案',
        collapsed: true,
        items: [
          article('界面用语', 'writing/voice'),
          article('操作名称', 'writing/actions'),
          article('状态与反馈文案', 'writing/states'),
          article('多语言与数据格式', 'writing/localization'),
        ],
      },
      {
        text: '页面模板',
        collapsed: true,
        items: [
          {
            text: '页面结构',
            items: [
              article('首页与工作台', 'templates/home'),
              article('列表页', 'templates/list'),
              article('详情页', 'templates/detail'),
              article('表单页', 'templates/form'),
              article('阅读与字幕页', 'templates/reading'),
              article('数据可视化页', 'templates/visualization'),
            ],
          },
          {
            text: '页面状态',
            items: [
              article('空状态页', 'templates/states'),
              article('异常页', 'templates/exception'),
              article('结果页', 'templates/result'),
            ],
          },
        ],
      },
      {
        text: '工程规约',
        collapsed: true,
        link: '/vis/engineering/',
        items: [
          {
            text: '编码规约',
            items: [
              article('通用编码规约', 'engineering/coding/common'),
              article('HTML 编码规约', 'engineering/coding/html'),
              article('CSS 编码规约', 'engineering/coding/css'),
              article('JavaScript 编码规约', 'engineering/coding/javascript'),
              article('React 编码规约', 'engineering/coding/react'),
              article('TypeScript 编码规约', 'engineering/coding/typescript'),
              article('Node.js 编码规约', 'engineering/coding/node'),
            ],
          },
          {
            text: '工程规约',
            items: [
              article('Git 规约', 'engineering/engineering/git'),
              article('文档通用规约', 'engineering/engineering/writing'),
              article('更新日志规约', 'engineering/engineering/changelog'),
              article('HTTP JSON API 规范', 'engineering/engineering/http-json-api'),
            ],
          },
        ],
      },
    ],
  },
]
