export default {
  "name": {
    "en-US": "Pic{highlight} — remove backgrounds and upscale in your browser",
    "zh-CN": "Pic{highlight} — 在浏览器中移除背景和放大",
    "ar-SA": "Pic{highlight} — أزل الخلفيات وكبّر الصور في متصفحك"
  },
  "brandColor": "#ef2142",
  "models": [
    {
      "id": "briaai/RMBG-1.4",
      "name": "RMBG 1.4",
      "loader": "custom",
      "dtype": "fp32",
      "dtypeWithFloat16": "fp16",
      "size": 1024,
      "hint": {
        "en-US": "any object, the most exact",
        "zh-CN": "任何物体，最精确",
        "ar-SA": "أي جسم، الأدق"
      },
      "tool": "cutout",
      "group": "models.group.cutout",
      "choose": "model"
    },
    {
      "id": "wonfy/BiRefNet_lite-ONNX-webgpu",
      "name": "BiRefNet lite",
      "loader": "pipeline",
      "dtype": "fp32",
      "dtypeWithFloat16": "fp16",
      "hint": {
        "en-US": "sharp edges and fine hair",
        "zh-CN": "边缘锐利，发丝细腻",
        "ar-SA": "حواف حادة وشعر دقيق"
      },
      "tool": "cutout",
      "group": "models.group.cutout",
      "choose": "model"
    },
    {
      "id": "Xenova/modnet",
      "name": "MODNet",
      "loader": "pipeline",
      "dtype": "fp32",
      "hint": {
        "en-US": "portraits, small and fast",
        "zh-CN": "人像，小而快",
        "ar-SA": "الصور الشخصية، صغير وسريع"
      },
      "tool": "cutout",
      "group": "models.group.cutout",
      "choose": "model"
    },
    {
      "id": "Xenova/swin2SR-lightweight-x2-64",
      "name": "Swin2SR lite ×2",
      "tool": "upscale",
      "loader": "upscale",
      "dtype": "fp32",
      "scale": 2,
      "mb": 8,
      "choose": "upscaleModel",
      "group": "models.group.upscale",
      "hint": {
        "en-US": "twice as big, very small and fast",
        "zh-CN": "放大 2 倍，非常小而快",
        "ar-SA": "ضعف الحجم، صغير جدًا وسريع"
      }
    },
    {
      "id": "Xenova/swin2SR-classical-sr-x2-64",
      "name": "Swin2SR ×2",
      "tool": "upscale",
      "loader": "upscale",
      "dtype": "fp32",
      "scale": 2,
      "mb": 54,
      "choose": "upscaleModel",
      "group": "models.group.upscale",
      "hint": {
        "en-US": "twice as big, sharper details",
        "zh-CN": "放大 2 倍，细节更清晰",
        "ar-SA": "ضعف الحجم، تفاصيل أوضح"
      }
    },
    {
      "id": "Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
      "name": "Swin2SR real-world ×4",
      "tool": "upscale",
      "loader": "upscale",
      "dtype": "fp32",
      "scale": 4,
      "mb": 53,
      "choose": "upscaleModel",
      "group": "models.group.upscale",
      "hint": {
        "en-US": "four times as big, for real images with noise",
        "zh-CN": "放大 4 倍，适合有噪点的真实图片",
        "ar-SA": "أربعة أضعاف الحجم، للصور الحقيقية ذات التشويش"
      }
    }
  ],
  "saveFolder": "Images",
  "media": {
    "image": [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "bmp",
      "avif"
    ],
    "video": [
      "mp4",
      "webm",
      "mov",
      "m4v",
      "ogv"
    ]
  },
  "mimeTypes": {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
    "avif": "image/avif",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mov": "video/quicktime",
    "m4v": "video/mp4",
    "ogv": "video/ogg"
  },
  "backgrounds": [
    "transparent",
    "white",
    "black",
    "custom"
  ],
  "downloadSuffix": {
    "cutout": "-no-background",
    "upscale": "-upscaled"
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
    "logo": {
      "en-US": "Pic<span class=\"highlight\">{highlight}</span>",
      "zh-CN": "Pic<span class=\"highlight\">{highlight}</span>",
      "ar-SA": "Pic<span class=\"highlight\">{highlight}</span>"
    },
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
    "drop.title": {
      "en-US": "Drop an image or a video here",
      "zh-CN": "把图片或视频拖到这里",
      "ar-SA": "أفلت صورة أو مقطع فيديو هنا"
    },
    "drop.text": {
      "en-US": "or paste an image (Ctrl+V), or choose a file. It never leaves your device: the models run in your browser with WebGPU. A video is done frame by frame; WebM and MP4 keep its sound.",
      "zh-CN": "也可以粘贴图片（Ctrl+V）或选择文件。文件不会离开你的设备：模型通过 WebGPU 在浏览器中运行。视频会逐帧处理；WebM 和 MP4 会保留声音。",
      "ar-SA": "أو الصق صورة (Ctrl+V) أو اختر ملفًا. لا يغادر جهازك أبدًا: تعمل النماذج في متصفحك عبر WebGPU. يُعالج الفيديو إطارًا بإطار، ويحتفظ WebM وMP4 بصوته."
    },
    "choose": {
      "en-US": "Choose file",
      "zh-CN": "选择文件",
      "ar-SA": "اختر ملفًا"
    },
    "original": {
      "en-US": "Original",
      "zh-CN": "原图",
      "ar-SA": "الأصل"
    },
    "result": {
      "en-US": "Result",
      "zh-CN": "结果",
      "ar-SA": "النتيجة"
    },
    "background.label": {
      "en-US": "Background",
      "zh-CN": "背景",
      "ar-SA": "الخلفية"
    },
    "background.transparent": {
      "en-US": "Transparent",
      "zh-CN": "透明",
      "ar-SA": "شفافة"
    },
    "background.white": {
      "en-US": "White",
      "zh-CN": "白色",
      "ar-SA": "بيضاء"
    },
    "background.black": {
      "en-US": "Black",
      "zh-CN": "黑色",
      "ar-SA": "سوداء"
    },
    "download": {
      "en-US": "Download PNG",
      "zh-CN": "下载 PNG",
      "ar-SA": "تنزيل PNG"
    },
    "another": {
      "en-US": "New file",
      "zh-CN": "新文件",
      "ar-SA": "ملف جديد"
    },
    "status.loadingModel": {
      "en-US": "Loading the model… {percent}%",
      "zh-CN": "正在加载模型… {percent}%",
      "ar-SA": "جارٍ تحميل النموذج… {percent}%"
    },
    "status.preparingModel": {
      "en-US": "Preparing the model on your graphics card…",
      "zh-CN": "正在你的显卡上准备模型…",
      "ar-SA": "جارٍ تجهيز النموذج على بطاقة الرسوميات…"
    },
    "status.done": {
      "en-US": "Done in {seconds} s · {width} × {height}",
      "zh-CN": "完成，用时 {seconds} 秒 · {width} × {height}",
      "ar-SA": "تم في {seconds} ث · {width} × {height}"
    },
    "error.noGpu": {
      "en-US": "WebGPU is not available in this browser, so the model cannot run. Use a recent Chrome or Edge.",
      "zh-CN": "此浏览器不支持 WebGPU，模型无法运行。请使用较新的 Chrome 或 Edge。",
      "ar-SA": "WebGPU غير متاح في هذا المتصفح، لذا لا يمكن تشغيل النموذج. استخدم Chrome أو Edge حديثًا."
    },
    "error.failed": {
      "en-US": "Could not remove the background: {message}",
      "zh-CN": "无法移除背景：{message}",
      "ar-SA": "تعذرت إزالة الخلفية: {message}"
    },
    "account": {
      "en-US": "Account",
      "zh-CN": "账户",
      "ar-SA": "الحساب"
    },
    "drive.choose": {
      "en-US": "From Drive",
      "zh-CN": "从云盘选择",
      "ar-SA": "من المساحة"
    },
    "drive.save": {
      "en-US": "Save to Drive",
      "zh-CN": "保存到云盘",
      "ar-SA": "حفظ في المساحة"
    },
    "drive.title": {
      "en-US": "Choose a file from your Drive",
      "zh-CN": "从你的云盘选择文件",
      "ar-SA": "اختر ملفًا من مساحتك"
    },
    "drive.search": {
      "en-US": "Search by name…",
      "zh-CN": "按名称搜索…",
      "ar-SA": "ابحث بالاسم…"
    },
    "drive.searchLabel": {
      "en-US": "Search the images and videos of your Drive",
      "zh-CN": "搜索云盘中的图片和视频",
      "ar-SA": "البحث في صور ومقاطع مساحتك"
    },
    "drive.loading": {
      "en-US": "Loading your files…",
      "zh-CN": "正在加载你的文件…",
      "ar-SA": "جارٍ تحميل ملفاتك…"
    },
    "drive.empty": {
      "en-US": "There are no images or videos in your Drive.",
      "zh-CN": "你的云盘里没有图片或视频。",
      "ar-SA": "لا توجد صور أو مقاطع فيديو في مساحتك."
    },
    "drive.noMatches": {
      "en-US": "No file matches this name.",
      "zh-CN": "没有与此名称匹配的文件。",
      "ar-SA": "لا يوجد ملف يطابق هذا الاسم."
    },
    "drive.failed": {
      "en-US": "Could not read your Drive: {message}",
      "zh-CN": "无法读取你的云盘：{message}",
      "ar-SA": "تعذرت قراءة مساحتك: {message}"
    },
    "drive.opening": {
      "en-US": "Opening {name}…",
      "zh-CN": "正在打开 {name}…",
      "ar-SA": "جارٍ فتح {name}…"
    },
    "save.prompt": {
      "en-US": "Save to your Drive as:",
      "zh-CN": "保存到你的云盘，文件名：",
      "ar-SA": "احفظ في مساحتك باسم:"
    },
    "save.exists": {
      "en-US": "{path} is already in your Drive. Replace it?",
      "zh-CN": "你的云盘里已有 {path}。要替换吗？",
      "ar-SA": "{path} موجود بالفعل في مساحتك. هل تريد استبداله؟"
    },
    "save.replace": {
      "en-US": "Replace",
      "zh-CN": "替换",
      "ar-SA": "استبدال"
    },
    "save.invalid": {
      "en-US": "This name is not allowed.",
      "zh-CN": "不允许使用此名称。",
      "ar-SA": "هذا الاسم غير مسموح."
    },
    "save.saving": {
      "en-US": "Saving to your Drive…",
      "zh-CN": "正在保存到你的云盘…",
      "ar-SA": "جارٍ الحفظ في مساحتك…"
    },
    "save.saved": {
      "en-US": "Saved to your Drive: {path}",
      "zh-CN": "已保存到你的云盘：{path}",
      "ar-SA": "تم الحفظ في مساحتك: {path}"
    },
    "save.failed": {
      "en-US": "Could not save to your Drive: {message}",
      "zh-CN": "无法保存到你的云盘：{message}",
      "ar-SA": "تعذر الحفظ في مساحتك: {message}"
    },
    "model.label": {
      "en-US": "Model",
      "zh-CN": "模型",
      "ar-SA": "النموذج"
    },
    "error.gpu": {
      "en-US": "The graphics card could not run this model ({message}). Reload the page before you try again.",
      "zh-CN": "显卡无法运行此模型（{message}）。请先刷新页面再试。",
      "ar-SA": "تعذر على بطاقة الرسوميات تشغيل هذا النموذج ({message}). أعد تحميل الصفحة قبل المحاولة مجددًا."
    },
    "error.reload": {
      "en-US": "The graphics card needs a fresh start: reload the page.",
      "zh-CN": "显卡需要重新开始：请刷新页面。",
      "ar-SA": "تحتاج بطاقة الرسوميات إلى بداية جديدة: أعد تحميل الصفحة."
    },
    "video.fpsShort": {
      "en-US": "FPS",
      "zh-CN": "帧率",
      "ar-SA": "إطارات/ث"
    },
    "video.fps": {
      "en-US": "Frames per second to process, for videos",
      "zh-CN": "视频每秒处理的帧数",
      "ar-SA": "عدد الإطارات في الثانية للفيديو"
    },
    "download.video": {
      "en-US": "Download video",
      "zh-CN": "下载视频",
      "ar-SA": "تنزيل الفيديو"
    },
    "download.frames": {
      "en-US": "Download frames",
      "zh-CN": "下载帧图",
      "ar-SA": "تنزيل الإطارات"
    },
    "stop": {
      "en-US": "Stop",
      "zh-CN": "停止",
      "ar-SA": "إيقاف"
    },
    "status.encoding": {
      "en-US": "Making the file… frame {done} of {total}",
      "zh-CN": "正在生成文件… 第 {done} / {total} 帧",
      "ar-SA": "جارٍ إنشاء الملف… الإطار {done} من {total}"
    },
    "status.doneVideo": {
      "en-US": "Done in {seconds} s · {frames} frames · {width} × {height}",
      "zh-CN": "完成，用时 {seconds} 秒 · {frames} 帧 · {width} × {height}",
      "ar-SA": "تم في {seconds} ث · {frames} إطارًا · {width} × {height}"
    },
    "error.noVideo": {
      "en-US": "This browser cannot read this video.",
      "zh-CN": "此浏览器无法读取该视频。",
      "ar-SA": "لا يستطيع هذا المتصفح قراءة هذا الفيديو."
    },
    "error.noRecorder": {
      "en-US": "This browser cannot make a WebM file. Download the frames instead.",
      "zh-CN": "此浏览器无法生成 WebM 文件。请改为下载帧图。",
      "ar-SA": "لا يستطيع هذا المتصفح إنشاء ملف WebM. نزّل الإطارات بدلًا من ذلك."
    },
    "background.custom": {
      "en-US": "Colour",
      "zh-CN": "颜色",
      "ar-SA": "لون"
    },
    "format.label": {
      "en-US": "Video format",
      "zh-CN": "视频格式",
      "ar-SA": "صيغة الفيديو"
    },
    "format.noAlpha": {
      "en-US": "no transparency",
      "zh-CN": "不支持透明",
      "ar-SA": "بلا شفافية"
    },
    "status.encodingGif": {
      "en-US": "Making the GIF… frame {done} of {total}",
      "zh-CN": "正在生成 GIF… 第 {done} / {total} 帧",
      "ar-SA": "جارٍ إنشاء GIF… الإطار {done} من {total}"
    },
    "set.models.label": {
      "en-US": "Models",
      "zh-CN": "模型",
      "ar-SA": "النماذج"
    },
    "set.models.hint": {
      "en-US": "Choose the model of each tool. The files of a model are kept in this browser: delete them to free the space, and the model downloads again when you use it.",
      "zh-CN": "为每个工具选择模型。模型文件保存在此浏览器中：删除后可释放空间，再次使用时会重新下载。",
      "ar-SA": "اختر نموذج كل أداة. تُحفظ ملفات النموذج في هذا المتصفح: احذفها لتحرير المساحة، وسيُنزَّل النموذج مجددا عند استخدامه."
    },
    "confirm.deleteModel": {
      "en-US": "Delete the downloaded files of {name} ({size})? They will download again when you use it.",
      "zh-CN": "删除 {name} 的已下载文件（{size}）？再次使用时会重新下载。",
      "ar-SA": "هل تريد حذف الملفات المنزّلة لـ {name} ({size})؟ ستُنزَّل مرة أخرى عند استخدامه."
    },
    "toast.modelDeleted": {
      "en-US": "{name} deleted",
      "zh-CN": "已删除 {name}",
      "ar-SA": "تم حذف {name}"
    },
    "models.delete": {
      "en-US": "Delete",
      "zh-CN": "删除",
      "ar-SA": "حذف"
    },
    "models.downloaded": {
      "en-US": "Downloaded",
      "zh-CN": "已下载",
      "ar-SA": "تم التنزيل"
    },
    "models.notDownloaded": {
      "en-US": "Not downloaded",
      "zh-CN": "未下载",
      "ar-SA": "غير منزَّل"
    },
    "tab.cutout": {
      "en-US": "Remove background",
      "zh-CN": "移除背景",
      "ar-SA": "إزالة الخلفية"
    },
    "tab.upscale": {
      "en-US": "Upscale",
      "zh-CN": "放大",
      "ar-SA": "تكبير"
    },
    "status.idle.cutout": {
      "en-US": "Choose an image or a video to remove its background.",
      "zh-CN": "选择一张图片或一个视频来移除背景。",
      "ar-SA": "اختر صورة أو فيديو لإزالة خلفيته."
    },
    "status.idle.upscale": {
      "en-US": "Choose an image or a video to make it bigger and sharper.",
      "zh-CN": "选择一张图片或一个视频，把它放大并变得更清晰。",
      "ar-SA": "اختر صورة أو فيديو لتكبيره وجعله أكثر وضوحًا."
    },
    "status.processing.cutout": {
      "en-US": "Removing the background…",
      "zh-CN": "正在移除背景…",
      "ar-SA": "جارٍ إزالة الخلفية…"
    },
    "status.processing.upscale": {
      "en-US": "Upscaling… part {done} of {total}",
      "zh-CN": "正在放大… 第 {done} / {total} 块",
      "ar-SA": "جارٍ التكبير… الجزء {done} من {total}"
    },
    "status.frame.cutout": {
      "en-US": "Removing the background… frame {done} of {total}",
      "zh-CN": "正在移除背景… 第 {done} / {total} 帧",
      "ar-SA": "جارٍ إزالة الخلفية… الإطار {done} من {total}"
    },
    "status.frame.upscale": {
      "en-US": "Upscaling… frame {done} of {total}",
      "zh-CN": "正在放大… 第 {done} / {total} 帧",
      "ar-SA": "جارٍ التكبير… الإطار {done} من {total}"
    },
    "status.stopped": {
      "en-US": "Stopped.",
      "zh-CN": "已停止。",
      "ar-SA": "تم الإيقاف."
    },
    "error.tooLarge": {
      "en-US": "This image would be {width} × {height} after the upscale, which is too big for the browser. Use a smaller image or the ×2 model.",
      "zh-CN": "放大后此图片将达到 {width} × {height}，浏览器无法处理。请使用更小的图片或 ×2 模型。",
      "ar-SA": "ستصبح هذه الصورة {width} × {height} بعد التكبير، وهذا أكبر مما يتحمله المتصفح. استخدم صورة أصغر أو نموذج ×2."
    },
    "error.tooLargeVideo": {
      "en-US": "The {frames} frames would be {width} × {height} each after the upscale, which is too much for the memory. Use fewer frames per second, a shorter video, or the ×2 model.",
      "zh-CN": "放大后 {frames} 帧每帧达到 {width} × {height}，内存无法容纳。请降低帧率、使用更短的视频或 ×2 模型。",
      "ar-SA": "ستكون {frames} إطارًا بحجم {width} × {height} لكل إطار بعد التكبير، وهذا أكثر مما تتحمله الذاكرة. استخدم عددًا أقل من الإطارات في الثانية أو فيديو أقصر أو نموذج ×2."
    },
    "models.group.cutout": {
      "en-US": "Remove background",
      "zh-CN": "移除背景",
      "ar-SA": "إزالة الخلفية"
    },
    "models.group.upscale": {
      "en-US": "Upscale",
      "zh-CN": "放大",
      "ar-SA": "تكبير"
    },
    "error.notImage": {
      "en-US": "This file is not an image or a video.",
      "zh-CN": "此文件不是图片或视频。",
      "ar-SA": "هذا الملف ليس صورة ولا فيديو."
    }
  },
  "video": {
    "fpsOptions": [
      5,
      10,
      15,
      24,
      30
    ],
    "bitsPerPixel": 0.2,
    "frameDigits": 5,
    "formats": [
      {
        "id": "webm",
        "name": "WebM",
        "extension": "webm",
        "recorderTypes": [
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm"
        ],
        "alpha": true
      },
      {
        "id": "mp4",
        "name": "MP4",
        "extension": "mp4",
        "recorderTypes": [
          "video/mp4;codecs=avc1",
          "video/mp4"
        ],
        "alpha": false
      },
      {
        "id": "gif",
        "name": "GIF",
        "extension": "gif",
        "alpha": true
      }
    ],
    "gif": {
      "levels": {
        "red": 6,
        "green": 7,
        "blue": 6
      },
      "alphaThreshold": 128
    }
  },
  "settings": {
    "defaults": {
      "tool": "cutout",
      "upscaleModel": "Xenova/swin2SR-lightweight-x2-64",
      "model": "briaai/RMBG-1.4",
      "fps": 10,
      "format": "webm",
      "background": "transparent",
      "customColour": "#00b140"
    },
    "fields": [
      {
        "id": "background",
        "type": "select",
        "optionsFrom": {
          "list": "backgrounds",
          "labelPrefix": "background."
        },
        "label": "background.label"
      },
      {
        "id": "customColour",
        "type": "color",
        "label": "background.custom"
      },
      {
        "id": "fps",
        "type": "select",
        "optionsFrom": {
          "list": "video.fpsOptions"
        },
        "label": "video.fps"
      },
      {
        "id": "format",
        "type": "select",
        "optionsFrom": {
          "list": "video.formats",
          "value": "id",
          "label": "name"
        },
        "label": "format.label"
      }
    ],
    "models": {
      "cache": "transformers-cache",
      "choose": "model",
      "list": "models",
      "repo": "id"
    },
    "panels": [
      "modelList"
    ]
  },
  "upscale": {
    "tile": 128,
    "overlap": 16,
    "maxPixels": 64000000,
    "maxVideoBytes": 1500000000
  }
};
