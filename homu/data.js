export default {
  "name": {
    "en-US": "Ho{highlight} — a start page for your browser",
    "zh-CN": "Ho{highlight} — 浏览器起始页",
    "ar-SA": "Ho{highlight} — صفحة البداية لمتصفحك"
  },
  "brandColor": "#1782db",
  "engines": [
    {
      "id": "google",
      "url": "https://www.google.com/search?q={query}"
    },
    {
      "id": "duckduckgo",
      "url": "https://duckduckgo.com/?q={query}"
    },
    {
      "id": "bing",
      "url": "https://www.bing.com/search?q={query}"
    },
    {
      "id": "brave",
      "url": "https://search.brave.com/search?q={query}"
    },
    {
      "id": "baidu",
      "url": "https://www.baidu.com/s?wd={query}"
    },
    {
      "id": "yandex",
      "url": "https://yandex.com/search/?text={query}"
    }
  ],
  "openTargets": [
    {
      "id": "new-tab",
      "target": "_blank"
    },
    {
      "id": "same-tab",
      "target": "_self"
    }
  ],
  "historyLimit": 30,
  "hourCycles": [
    {
      "id": "auto"
    },
    {
      "id": "12",
      "hour12": true
    },
    {
      "id": "24",
      "hour12": false
    }
  ],
  "clock": {
    "time": {
      "hour": "numeric",
      "minute": "2-digit"
    },
    "date": {
      "weekday": "long",
      "month": "long",
      "day": "numeric"
    }
  },
  "greetings": [
    {
      "id": "night",
      "from": 0
    },
    {
      "id": "morning",
      "from": 5
    },
    {
      "id": "afternoon",
      "from": 12
    },
    {
      "id": "evening",
      "from": 18
    }
  ],
  "settings": {
    "defaults": {
      "engine": "google",
      "openIn": "new-tab",
      "clock": true,
      "greeting": true,
      "hourCycle": "auto",
      "history": true
    },
    "fields": [
      {
        "id": "engine",
        "type": "select",
        "optionsFrom": {
          "list": "engines",
          "value": "id",
          "labelPrefix": "engine."
        },
        "label": "set.engine"
      },
      {
        "id": "openIn",
        "type": "select",
        "optionsFrom": {
          "list": "openTargets",
          "value": "id",
          "labelPrefix": "open."
        },
        "label": "set.openIn"
      },
      {
        "id": "clock",
        "type": "checkbox",
        "label": "set.clock"
      },
      {
        "id": "greeting",
        "type": "checkbox",
        "label": "set.greeting"
      },
      {
        "id": "hourCycle",
        "type": "select",
        "optionsFrom": {
          "list": "hourCycles",
          "value": "id",
          "labelPrefix": "hours."
        },
        "label": "set.hourCycle"
      },
      {
        "id": "history",
        "type": "checkbox",
        "label": "set.history"
      }
    ],
    "panels": [
      "bookmarkData",
      "historyData"
    ]
  },
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
    "copyright": {
      "en-US": "© {brand}",
      "zh-CN": "© {brand}",
      "ar-SA": "© {brand}"
    },
    "settings": {
      "en-US": "Settings",
      "zh-CN": "设置",
      "ar-SA": "الإعدادات"
    },
    "close": {
      "en-US": "Close",
      "zh-CN": "关闭",
      "ar-SA": "إغلاق"
    },
    "account": {
      "en-US": "Account",
      "zh-CN": "账户",
      "ar-SA": "الحساب"
    },
    "language": {
      "en-US": "Language",
      "zh-CN": "语言",
      "ar-SA": "اللغة"
    },
    "logo": {
      "en-US": "Ho<span class=\"highlight\">{highlight}</span>",
      "zh-CN": "Ho<span class=\"highlight\">{highlight}</span>",
      "ar-SA": "Ho<span class=\"highlight\">{highlight}</span>"
    },
    "search.placeholder": {
      "en-US": "Search the web or type an address",
      "zh-CN": "搜索网页或输入网址",
      "ar-SA": "ابحث في الويب أو اكتب عنوانا"
    },
    "search.label": {
      "en-US": "Search",
      "zh-CN": "搜索",
      "ar-SA": "بحث"
    },
    "engine.label": {
      "en-US": "Search engine",
      "zh-CN": "搜索引擎",
      "ar-SA": "محرك البحث"
    },
    "engine.google": {
      "en-US": "Google",
      "zh-CN": "Google",
      "ar-SA": "Google"
    },
    "engine.duckduckgo": {
      "en-US": "DuckDuckGo",
      "zh-CN": "DuckDuckGo",
      "ar-SA": "DuckDuckGo"
    },
    "engine.bing": {
      "en-US": "Bing",
      "zh-CN": "Bing",
      "ar-SA": "Bing"
    },
    "engine.brave": {
      "en-US": "Brave",
      "zh-CN": "Brave",
      "ar-SA": "Brave"
    },
    "engine.baidu": {
      "en-US": "Baidu",
      "zh-CN": "百度",
      "ar-SA": "Baidu"
    },
    "engine.yandex": {
      "en-US": "Yandex",
      "zh-CN": "Yandex",
      "ar-SA": "Yandex"
    },
    "action.search": {
      "en-US": "Search",
      "zh-CN": "搜索",
      "ar-SA": "بحث"
    },
    "action.add": {
      "en-US": "Add bookmark",
      "zh-CN": "添加书签",
      "ar-SA": "إضافة إشارة مرجعية"
    },
    "action.save": {
      "en-US": "Save",
      "zh-CN": "保存",
      "ar-SA": "حفظ"
    },
    "bookmark.more": {
      "en-US": "Options of {title}",
      "zh-CN": "{title} 的选项",
      "ar-SA": "خيارات {title}"
    },
    "menu.openNew": {
      "en-US": "Open in a new tab",
      "zh-CN": "在新标签页中打开",
      "ar-SA": "فتح في علامة تبويب جديدة"
    },
    "menu.copy": {
      "en-US": "Copy link",
      "zh-CN": "复制链接",
      "ar-SA": "نسخ الرابط"
    },
    "menu.edit": {
      "en-US": "Edit",
      "zh-CN": "编辑",
      "ar-SA": "تعديل"
    },
    "menu.delete": {
      "en-US": "Delete",
      "zh-CN": "删除",
      "ar-SA": "حذف"
    },
    "form.add": {
      "en-US": "New bookmark",
      "zh-CN": "新建书签",
      "ar-SA": "إشارة مرجعية جديدة"
    },
    "form.edit": {
      "en-US": "Edit bookmark",
      "zh-CN": "编辑书签",
      "ar-SA": "تعديل الإشارة المرجعية"
    },
    "field.title": {
      "en-US": "Title",
      "zh-CN": "标题",
      "ar-SA": "العنوان"
    },
    "field.title.hint": {
      "en-US": "Left empty, the name of the site is used.",
      "zh-CN": "留空则使用网站名称。",
      "ar-SA": "إذا تُرك فارغا يُستخدم اسم الموقع."
    },
    "field.address": {
      "en-US": "Address",
      "zh-CN": "网址",
      "ar-SA": "عنوان الموقع"
    },
    "field.address.hint": {
      "en-US": "For example example.com or https://example.com/page",
      "zh-CN": "例如 example.com 或 https://example.com/page",
      "ar-SA": "مثل example.com أو https://example.com/page"
    },
    "status.empty": {
      "en-US": "No bookmarks yet. Add the sites you open every day.",
      "zh-CN": "还没有书签。添加你每天打开的网站。",
      "ar-SA": "لا توجد إشارات مرجعية بعد. أضف المواقع التي تفتحها كل يوم."
    },
    "status.count": {
      "en-US": "Bookmarks: {n}. Type to search the web or to find one.",
      "zh-CN": "书签：{n}。输入内容以搜索网页或查找书签。",
      "ar-SA": "الإشارات المرجعية: {n}. اكتب للبحث في الويب أو للعثور على إشارة."
    },
    "status.query": {
      "en-US": "Bookmarks found: {n}. Press Enter to search the web.",
      "zh-CN": "找到的书签：{n}。按回车键搜索网页。",
      "ar-SA": "الإشارات المرجعية الموجودة: {n}. اضغط Enter للبحث في الويب."
    },
    "toast.added": {
      "en-US": "Bookmark added.",
      "zh-CN": "书签已添加。",
      "ar-SA": "تمت إضافة الإشارة المرجعية."
    },
    "toast.saved": {
      "en-US": "Bookmark saved.",
      "zh-CN": "书签已保存。",
      "ar-SA": "تم حفظ الإشارة المرجعية."
    },
    "toast.deleted": {
      "en-US": "Bookmark deleted.",
      "zh-CN": "书签已删除。",
      "ar-SA": "تم حذف الإشارة المرجعية."
    },
    "toast.copied": {
      "en-US": "Copied.",
      "zh-CN": "已复制。",
      "ar-SA": "تم النسخ."
    },
    "error.address": {
      "en-US": "Write a site name such as example.com, or an address that starts with http:// or https://.",
      "zh-CN": "请输入网站名称（如 example.com），或以 http:// 或 https:// 开头的网址。",
      "ar-SA": "اكتب اسم موقع مثل example.com أو عنوانا يبدأ بـ http:// أو https://."
    },
    "error.exists": {
      "en-US": "This address is already in your bookmarks.",
      "zh-CN": "此网址已在你的书签中。",
      "ar-SA": "هذا العنوان موجود بالفعل في إشاراتك المرجعية."
    },
    "error.failed": {
      "en-US": "It failed: {message}",
      "zh-CN": "失败：{message}",
      "ar-SA": "فشل الأمر: {message}"
    },
    "confirm.delete": {
      "en-US": "Delete the bookmark “{title}”?",
      "zh-CN": "删除书签“{title}”？",
      "ar-SA": "هل تريد حذف الإشارة المرجعية «{title}»؟"
    },
    "greeting.night": {
      "en-US": "Hello",
      "zh-CN": "你好",
      "ar-SA": "مرحبا"
    },
    "greeting.morning": {
      "en-US": "Good morning",
      "zh-CN": "早上好",
      "ar-SA": "صباح الخير"
    },
    "greeting.afternoon": {
      "en-US": "Good afternoon",
      "zh-CN": "下午好",
      "ar-SA": "نهارك سعيد"
    },
    "greeting.evening": {
      "en-US": "Good evening",
      "zh-CN": "晚上好",
      "ar-SA": "مساء الخير"
    },
    "field.group": {
      "en-US": "Group",
      "zh-CN": "分组",
      "ar-SA": "المجموعة"
    },
    "field.group.hint": {
      "en-US": "Optional. Bookmarks of the same group show together.",
      "zh-CN": "可选。同一分组的书签会显示在一起。",
      "ar-SA": "اختياري. تظهر الإشارات المرجعية في المجموعة نفسها معا."
    },
    "menu.earlier": {
      "en-US": "Move earlier",
      "zh-CN": "前移",
      "ar-SA": "نقل إلى الأمام"
    },
    "menu.later": {
      "en-US": "Move later",
      "zh-CN": "后移",
      "ar-SA": "نقل إلى الخلف"
    },
    "set.clock": {
      "en-US": "Show the clock and the date",
      "zh-CN": "显示时钟和日期",
      "ar-SA": "إظهار الساعة والتاريخ"
    },
    "set.greeting": {
      "en-US": "Show a greeting",
      "zh-CN": "显示问候语",
      "ar-SA": "إظهار التحية"
    },
    "set.hourCycle": {
      "en-US": "Hours",
      "zh-CN": "时间制",
      "ar-SA": "نظام الساعات"
    },
    "hours.auto": {
      "en-US": "Follow the language",
      "zh-CN": "跟随语言",
      "ar-SA": "حسب اللغة"
    },
    "hours.12": {
      "en-US": "12 hours",
      "zh-CN": "12 小时制",
      "ar-SA": "12 ساعة"
    },
    "hours.24": {
      "en-US": "24 hours",
      "zh-CN": "24 小时制",
      "ar-SA": "24 ساعة"
    },
    "set.history": {
      "en-US": "Remember my searches",
      "zh-CN": "记住我的搜索",
      "ar-SA": "تذكر عمليات بحثي"
    },
    "set.history.label": {
      "en-US": "Search history",
      "zh-CN": "搜索历史",
      "ar-SA": "سجل البحث"
    },
    "set.history.hint": {
      "en-US": "The searches that you made here are kept only in this browser, and the box offers them as you type. Delete them when you want.",
      "zh-CN": "你在此进行的搜索只保存在此浏览器中，输入时搜索框会提示它们。你可以随时删除。",
      "ar-SA": "تُحفظ عمليات البحث التي أجريتها هنا في هذا المتصفح فقط، ويقترحها مربع البحث أثناء الكتابة. يمكنك حذفها متى شئت."
    },
    "history.delete": {
      "en-US": "Delete history",
      "zh-CN": "删除历史",
      "ar-SA": "حذف السجل"
    },
    "history.confirm": {
      "en-US": "Delete the {n} searches that were kept? This cannot be undone.",
      "zh-CN": "删除已保存的 {n} 条搜索？此操作无法撤销。",
      "ar-SA": "هل تريد حذف عمليات البحث المحفوظة ({n})؟ لا يمكن التراجع عن ذلك."
    },
    "history.deleted": {
      "en-US": "Search history deleted.",
      "zh-CN": "搜索历史已删除。",
      "ar-SA": "تم حذف سجل البحث."
    },
    "history.none": {
      "en-US": "No searches kept yet",
      "zh-CN": "还没有保存的搜索",
      "ar-SA": "لا توجد عمليات بحث محفوظة بعد"
    },
    "set.engine": {
      "en-US": "Search engine",
      "zh-CN": "搜索引擎",
      "ar-SA": "محرك البحث"
    },
    "set.openIn": {
      "en-US": "Open links in",
      "zh-CN": "打开链接的方式",
      "ar-SA": "فتح الروابط في"
    },
    "open.new-tab": {
      "en-US": "A new tab",
      "zh-CN": "新标签页",
      "ar-SA": "علامة تبويب جديدة"
    },
    "open.same-tab": {
      "en-US": "The same tab",
      "zh-CN": "当前标签页",
      "ar-SA": "علامة التبويب نفسها"
    },
    "set.data.label": {
      "en-US": "Bookmarks",
      "zh-CN": "书签",
      "ar-SA": "الإشارات المرجعية"
    },
    "set.data.hint": {
      "en-US": "Bookmarks are kept only in this browser. Export a backup, import one (a file of this app, or the bookmarks that a browser exported as HTML), or delete them all.",
      "zh-CN": "书签只保存在此浏览器中。你可以导出备份、导入备份（本应用的文件，或浏览器导出的 HTML 书签），或全部删除。",
      "ar-SA": "تُحفظ الإشارات المرجعية في هذا المتصفح فقط. يمكنك تصدير نسخة احتياطية أو استيراد نسخة (ملف من هذا التطبيق أو إشارات صدّرها المتصفح بصيغة HTML) أو حذفها كلها."
    },
    "data.exportAll": {
      "en-US": "Export",
      "zh-CN": "导出",
      "ar-SA": "تصدير"
    },
    "data.import": {
      "en-US": "Import",
      "zh-CN": "导入",
      "ar-SA": "استيراد"
    },
    "data.deleteAll": {
      "en-US": "Delete all",
      "zh-CN": "全部删除",
      "ar-SA": "حذف الكل"
    },
    "data.deleted": {
      "en-US": "All bookmarks deleted.",
      "zh-CN": "所有书签已删除。",
      "ar-SA": "تم حذف كل الإشارات المرجعية."
    },
    "toast.imported": {
      "en-US": "{n} bookmarks imported",
      "zh-CN": "已导入 {n} 个书签",
      "ar-SA": "تم استيراد {n} إشارة مرجعية"
    },
    "toast.invalidImport": {
      "en-US": "Invalid import file",
      "zh-CN": "导入文件无效",
      "ar-SA": "ملف الاستيراد غير صالح"
    },
    "toast.noBookmarks": {
      "en-US": "No bookmarks yet",
      "zh-CN": "还没有书签",
      "ar-SA": "لا توجد إشارات مرجعية بعد"
    },
    "confirm.deleteAll": {
      "en-US": "Delete all {n} bookmarks? This cannot be undone.",
      "zh-CN": "删除全部 {n} 个书签？此操作无法撤销。",
      "ar-SA": "هل تريد حذف كل الإشارات المرجعية ({n})؟ لا يمكن التراجع عن ذلك."
    }
  }
};
