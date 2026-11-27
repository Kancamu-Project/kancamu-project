export default {
  "name": {
    "en-US": "Asset{highlight} — every asset of the apps",
    "zh-CN": "Asset{highlight} — 所有应用的资源",
    "ar-SA": "Asset{highlight} — كل موارد التطبيقات"
  },
  "brandColor": "#1cc93d",
  "palette": [
    {
      "name": "black",
      "ink": "white"
    },
    {
      "name": "white",
      "ink": "black"
    },
    {
      "name": "red",
      "ink": "on-color"
    },
    {
      "name": "yellow",
      "ink": "on-color"
    },
    {
      "name": "blue",
      "ink": "on-color"
    },
    {
      "name": "green",
      "ink": "on-color"
    }
  ],
  "roles": [
    {
      "name": "bg",
      "ink": "fg"
    },
    {
      "name": "bg-1",
      "ink": "fg"
    },
    {
      "name": "border",
      "ink": "fg"
    },
    {
      "name": "fg",
      "ink": "bg"
    },
    {
      "name": "fg-1",
      "ink": "bg"
    },
    {
      "name": "neutral",
      "ink": "bg"
    },
    {
      "name": "neutral-soft",
      "ink": "fg"
    },
    {
      "name": "accent",
      "ink": "accent-ink"
    },
    {
      "name": "accent-ink",
      "ink": "accent"
    },
    {
      "name": "accent-text",
      "ink": "bg"
    },
    {
      "name": "danger",
      "ink": "on-color"
    },
    {
      "name": "ok",
      "ink": "on-color"
    },
    {
      "name": "on-color",
      "ink": "bg"
    }
  ],
  "sizes": [
    {
      "group": "gap",
      "names": [
        "gap-extra-small",
        "gap-small",
        "gap-medium",
        "gap-large",
        "gap-extra-large"
      ]
    },
    {
      "group": "padding",
      "names": [
        "padding-extra-small",
        "padding-small",
        "padding-medium",
        "padding-large",
        "padding-extra-large"
      ]
    },
    {
      "group": "fontSize",
      "names": [
        "font-size-extra-small",
        "font-size-small",
        "font-size-medium",
        "font-size-large",
        "font-size-extra-large"
      ]
    },
    {
      "group": "radius",
      "names": [
        "border-radius-small",
        "border-radius-medium",
        "border-radius-large"
      ]
    },
    {
      "group": "iconSize",
      "names": [
        "icon-size-extra-small",
        "icon-size-small",
        "icon-size-medium",
        "icon-size-large",
        "icon-size-extra-large"
      ]
    },
    {
      "group": "other",
      "names": [
        "unit",
        "height",
        "border-width",
        "border-width-thick",
        "sidebar-width"
      ]
    }
  ],
  "sectionOrder": [
    "colours",
    "apps",
    "previews",
    "icons",
    "fonts",
    "sizes",
    "files"
  ],
  "icons": [
    "alert",
    "archive",
    "arrow-down",
    "arrow-up",
    "audio",
    "check",
    "chevron-down",
    "chevron-down-black",
    "chevron-down-white",
    "chevron-left",
    "chevron-right",
    "close",
    "copy",
    "cpu",
    "download",
    "external",
    "file",
    "file-text",
    "folder",
    "folder-open",
    "folder-plus",
    "folder-up",
    "git-branch",
    "grid",
    "hard-drive",
    "heart",
    "image",
    "info",
    "layers",
    "list",
    "lock",
    "logo-drivemu",
    "logout",
    "menu",
    "moon",
    "more",
    "pause",
    "pdf",
    "pencil",
    "play",
    "plus",
    "refresh",
    "repeat",
    "search",
    "send",
    "shuffle",
    "skip-back",
    "skip-forward",
    "sliders",
    "star",
    "stop",
    "sun",
    "swap",
    "trash",
    "upload",
    "user",
    "video",
    "volume",
    "warning",
    "zap"
  ],
  "fonts": [
    {
      "file": "inter-latin-400-normal.woff2",
      "family": "Inter",
      "weight": 400,
      "loaded": true,
      "usedBy": "every"
    },
    {
      "file": "inter-latin-700-normal.woff2",
      "family": "Inter",
      "weight": 700,
      "loaded": true,
      "usedBy": "every"
    },
    {
      "file": "jetbrains-mono-latin-400-normal.woff2",
      "family": "JetBrains Mono",
      "weight": 400,
      "loaded": true,
      "usedBy": "every"
    },
    {
      "file": "jetbrains-mono-latin-700-normal.woff2",
      "family": "JetBrains Mono",
      "weight": 700,
      "loaded": true,
      "usedBy": "every"
    }
  ],
  "files": [
    {
      "name": "css/shared.css",
      "description": {
        "en-US": "The shared look, in one file: style (fonts, colours, the theme, the reset, and the basics of buttons, inputs, and selects), components (the templates: icons, buttons, the search box, the progress bar, the segmented control, and the empty state), and page (the header, the footer, the main, and the sidebar with its drawer, for a body with the class page: every app but the main website).",
        "zh-CN": "共享外观，只有一个文件：style（字体、颜色、主题、重置，以及按钮、输入框和选择框的基础样式）、components（模板：图标、按钮、搜索框、进度条、分段控件和空状态）和 page（页眉、页脚、主区域和带抽屉的侧栏，用于带有 page 类的 body：除主网站外的所有应用）。",
        "ar-SA": "المظهر المشترك في ملف واحد: style (الخطوط والألوان والمظهر وإعادة الضبط وأساسيات الأزرار وحقول الإدخال) وcomponents (القوالب: الأيقونات والأزرار وحقل البحث وشريط التقدم والتحكم المقطّع والحالة الفارغة) وpage (الترويسة والتذييل والمحتوى والشريط الجانبي مع درجه، لعنصر body الذي له الصنف page: كل التطبيقات ما عدا الموقع الرئيسي)."
      }
    },
    {
      "name": "js/shared.js",
      "description": {
        "en-US": "The shared code, in one file, in parts: icons (a variable of each icon), theme (the saved theme before the page shows), cleanup, url, i18n (the language and the colour of the app), popup (popups.ask, popups.tell, popups.toast), components (the helpers of the templates and the tags kit-*), autocomplete, account (the GitHub sign-in), transfer (files dragged between apps), settings, and storage (the GitHub storage).",
        "zh-CN": "共享代码，只有一个文件，分为几部分：icons（每个图标一个变量）、theme（页面显示前应用已保存的主题）、cleanup、url、i18n（语言和应用颜色）、popup（popups.ask、popups.tell、popups.toast）、components（模板的辅助函数和 kit-* 标签）、autocomplete、account（GitHub 登录）、transfer（在应用之间拖动文件）、settings 和 storage（GitHub 存储）。",
        "ar-SA": "الشيفرة المشتركة في ملف واحد، على أجزاء: icons (متغير لكل أيقونة) وtheme (المظهر المحفوظ قبل ظهور الصفحة) وcleanup وurl وi18n (اللغة ولون التطبيق) وpopup (popups.ask وpopups.tell وpopups.toast) وcomponents (الدوال المساعدة للقوالب والوسوم kit-*) وautocomplete وaccount (تسجيل الدخول إلى GitHub) وtransfer (الملفات المسحوبة بين التطبيقات) وsettings وstorage (تخزين GitHub)."
      }
    },
    {
      "name": "data/data.js",
      "description": {
        "en-US": "The shared data, in one file, a named export for each part: brand (the id, the name, and the highlighted word), popup and kit (the texts of the shared dialog and of the tags kit-*, in every language), auth (the sign-in), and appearance (the Appearance page).",
        "zh-CN": "共享数据，只有一个文件，每部分是一个命名导出：brand（标识、名称和高亮词）、popup 和 kit（共享对话框和 kit-* 标签的文字，包含所有语言）、auth（登录）和 appearance（外观页面）。",
        "ar-SA": "البيانات المشتركة في ملف واحد، وكل جزء تصدير مسمّى: brand (المعرّف والاسم والكلمة المميزة) وpopup وkit (نصوص المربع المشترك والوسوم kit-* بكل اللغات) وauth (تسجيل الدخول) وappearance (صفحة المظهر)."
      }
    },
    {
      "name": "icons/icons.js",
      "description": {
        "en-US": "Every icon of the interface, in one file: the SVG of each, which follows the colour of the text. shared.js makes a variable of each, --icon-<name>.",
        "zh-CN": "界面的所有图标，只有一个文件：每个图标的 SVG，随文字颜色变化。shared.js 为每个图标生成一个变量 --icon-<name>。",
        "ar-SA": "كل أيقونات الواجهة في ملف واحد: SVG لكل واحدة، يتبع لون النص. ينشئ shared.js متغيرا لكل أيقونة، --icon-<name>."
      }
    },
    {
      "name": "fonts/",
      "description": {
        "en-US": "The fonts, as WOFF2 files. shared.css loads Inter and JetBrains Mono (muOS loads JetBrains Mono too).",
        "zh-CN": "字体，以 WOFF2 文件提供。shared.css 加载 Inter 和 JetBrains Mono（muOS 也加载 JetBrains Mono）。",
        "ar-SA": "الخطوط كملفات WOFF2. يحمّل shared.css الخطين Inter وJetBrains Mono (ويحمّل muOS الخط JetBrains Mono أيضا)."
      }
    }
  ],
  "languages": [
    {
      "code": "en-US",
      "name": "English",
      "dir": "ltr"
    },
    {
      "code": "zh-CN",
      "name": "简体中文",
      "dir": "ltr"
    },
    {
      "code": "ar-SA",
      "name": "العربية",
      "dir": "rtl"
    }
  ],
  "ui": {
    "logo": {
      "en-US": "Asset<span class=\"highlight\">{highlight}</span>",
      "zh-CN": "Asset<span class=\"highlight\">{highlight}</span>",
      "ar-SA": "Asset<span class=\"highlight\">{highlight}</span>"
    },
    "copyright": {
      "en-US": "© {brand}",
      "zh-CN": "© {brand}",
      "ar-SA": "© {brand}"
    },
    "account": {
      "en-US": "Account",
      "zh-CN": "账户",
      "ar-SA": "الحساب"
    },
    "close": {
      "en-US": "Close",
      "zh-CN": "关闭",
      "ar-SA": "إغلاق"
    },
    "section.colours": {
      "en-US": "Colours",
      "zh-CN": "颜色",
      "ar-SA": "الألوان"
    },
    "section.apps": {
      "en-US": "Apps",
      "zh-CN": "应用",
      "ar-SA": "التطبيقات"
    },
    "section.icons": {
      "en-US": "Icons",
      "zh-CN": "图标",
      "ar-SA": "الأيقونات"
    },
    "section.fonts": {
      "en-US": "Fonts",
      "zh-CN": "字体",
      "ar-SA": "الخطوط"
    },
    "section.sizes": {
      "en-US": "Sizes",
      "zh-CN": "尺寸",
      "ar-SA": "المقاسات"
    },
    "section.files": {
      "en-US": "Files",
      "zh-CN": "文件",
      "ar-SA": "الملفات"
    },
    "colours.palette": {
      "en-US": "Palette",
      "zh-CN": "调色板",
      "ar-SA": "لوحة الألوان"
    },
    "colours.paletteHint": {
      "en-US": "Six colours. Red, yellow, blue, and green are lighter in the dark theme and darker in the light theme. Click one to copy its name.",
      "zh-CN": "六种颜色。红、黄、蓝、绿在深色主题中更亮，在浅色主题中更深。点击即可复制名称。",
      "ar-SA": "ستة ألوان. الأحمر والأصفر والأزرق والأخضر أفتح في المظهر الداكن وأغمق في المظهر الفاتح. انقر لنسخ الاسم."
    },
    "colours.roles": {
      "en-US": "Roles",
      "zh-CN": "角色色",
      "ar-SA": "الأدوار"
    },
    "colours.rolesHint": {
      "en-US": "What the components use. They change with the theme.",
      "zh-CN": "组件使用的颜色，会随主题变化。",
      "ar-SA": "ما تستخدمه المكونات. تتغير مع المظهر."
    },
    "apps.hint": {
      "en-US": "The icon and the colour of every app of the site. The colour is a hex, or the name of a colour of the palette.",
      "zh-CN": "站点中每个应用的图标和颜色。颜色是十六进制值，或调色板中的颜色名。",
      "ar-SA": "أيقونة ولون كل تطبيق. اللون قيمة سداسية أو اسم لون من اللوحة."
    },
    "icons.hint": {
      "en-US": "Every icon is an SVG file in assets/icons that follows the colour of the text. Click one to copy its file name.",
      "zh-CN": "每个图标都是 assets/icons 中的 SVG 文件，并随文字颜色变化。点击即可复制文件名。",
      "ar-SA": "كل أيقونة ملف SVG في assets/icons تتبع لون النص. انقر لنسخ اسم الملف."
    },
    "icons.search": {
      "en-US": "Search icons…",
      "zh-CN": "搜索图标…",
      "ar-SA": "ابحث عن أيقونة…"
    },
    "icons.searchLabel": {
      "en-US": "Search the icons",
      "zh-CN": "搜索图标",
      "ar-SA": "البحث في الأيقونات"
    },
    "icons.count": {
      "en-US": "{count} icons",
      "zh-CN": "{count} 个图标",
      "ar-SA": "{count} أيقونة"
    },
    "icons.none": {
      "en-US": "No icon has this name.",
      "zh-CN": "没有此名称的图标。",
      "ar-SA": "لا توجد أيقونة بهذا الاسم."
    },
    "fonts.hint": {
      "en-US": "shared.css loads both fonts, so every app has them: Inter for the text and JetBrains Mono for code. muOS also loads JetBrains Mono itself. The files are in assets/fonts.",
      "zh-CN": "shared.css 加载这两种字体，所有应用都可使用：Inter 用于文字，JetBrains Mono 用于代码。muOS 也自行加载 JetBrains Mono。文件在 assets/fonts 中。",
      "ar-SA": "يحمّل shared.css الخطين معا فتستخدمهما كل التطبيقات: Inter للنص وJetBrains Mono للشيفرة. ويحمّل muOS الخط JetBrains Mono بنفسه أيضا. الملفات في assets/fonts."
    },
    "fonts.sample": {
      "en-US": "The quick brown fox jumps over the lazy dog 0123456789",
      "zh-CN": "The quick brown fox jumps over the lazy dog 0123456789",
      "ar-SA": "The quick brown fox jumps over the lazy dog 0123456789"
    },
    "fonts.notLoaded": {
      "en-US": "loaded only by muOS",
      "zh-CN": "仅由 muOS 加载",
      "ar-SA": "يحمّله muOS فقط"
    },
    "sizes.hint": {
      "en-US": "The scales of shared.css. A layout.css uses them, and writes no length of its own.",
      "zh-CN": "shared.css 的尺度。layout.css 使用这些尺度，不自行写长度。",
      "ar-SA": "مقاييس shared.css. يستخدمها layout.css ولا يكتب أي طول من عنده."
    },
    "sizes.gap": {
      "en-US": "Gap",
      "zh-CN": "间距",
      "ar-SA": "المسافة بين العناصر"
    },
    "sizes.padding": {
      "en-US": "Padding",
      "zh-CN": "内边距",
      "ar-SA": "الحشو"
    },
    "sizes.fontSize": {
      "en-US": "Font size",
      "zh-CN": "字号",
      "ar-SA": "حجم الخط"
    },
    "sizes.radius": {
      "en-US": "Border radius",
      "zh-CN": "圆角",
      "ar-SA": "استدارة الحواف"
    },
    "sizes.iconSize": {
      "en-US": "Icon size",
      "zh-CN": "图标尺寸",
      "ar-SA": "حجم الأيقونة"
    },
    "sizes.other": {
      "en-US": "Other",
      "zh-CN": "其他",
      "ar-SA": "أخرى"
    },
    "files.hint": {
      "en-US": "What is in the assets folder.",
      "zh-CN": "assets 文件夹中的内容。",
      "ar-SA": "ما في مجلد assets."
    },
    "copied": {
      "en-US": "Copied {text}",
      "zh-CN": "已复制 {text}",
      "ar-SA": "تم نسخ {text}"
    },
    "copy.failed": {
      "en-US": "Could not copy.",
      "zh-CN": "无法复制。",
      "ar-SA": "تعذر النسخ."
    },
    "theme": {
      "en-US": "Theme",
      "zh-CN": "主题",
      "ar-SA": "المظهر"
    },
    "menu": {
      "en-US": "Sections",
      "zh-CN": "栏目",
      "ar-SA": "الأقسام"
    },
    "section.previews": {
      "en-US": "Previews",
      "zh-CN": "预览",
      "ar-SA": "المعاينات"
    },
    "previews.hint": {
      "en-US": "How a link to the main website and to every app looks where it is shared (Open Graph). Each card is an element made here: save it as an image, and put the image in the folder of the app as preview.png.",
      "zh-CN": "指向主网站和每个应用的链接在分享处的样子（Open Graph）。每张卡片都是在这里制作的元素：把它保存为图片，并作为 preview.png 放入对应应用的文件夹。",
      "ar-SA": "شكل الرابط إلى الموقع الرئيسي وإلى كل تطبيق حيث يُشارك (Open Graph). كل بطاقة عنصر يُصنع هنا: احفظها كصورة وضعها في مجلد التطبيق باسم preview.png."
    },
    "previews.save": {
      "en-US": "Save as image",
      "zh-CN": "保存为图片",
      "ar-SA": "حفظ كصورة"
    },
    "previews.saved": {
      "en-US": "Saved {name}",
      "zh-CN": "已保存 {name}",
      "ar-SA": "تم حفظ {name}"
    },
    "previews.failed": {
      "en-US": "The image could not be made: {message}",
      "zh-CN": "无法生成图片：{message}",
      "ar-SA": "تعذّر إنشاء الصورة: {message}"
    }
  }
};
