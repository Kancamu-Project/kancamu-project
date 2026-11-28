export default {
  "name": {
    "en-US": "Guyon{highlight} — say it, laugh, and share",
    "zh-CN": "Guyon{highlight} — 说说笑笑，分享一切",
    "ar-SA": "Guyon{highlight} — قل، اضحك، وشارك"
  },
  "brandColor": "#1782db",
  "api": {
    "production": "https://kancamu-guyonmu.yusuf-expert-official.workers.dev",
    "local": "http://localhost:8788"
  },
  "feeds": [
    {
      "id": "following",
      "icon": "list"
    },
    {
      "id": "saved",
      "icon": "bookmark"
    }
  ],
  "preview": {
    "chars": 400,
    "lines": 8
  },
  "imageTypes": [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ],
  "notificationIcons": {
    "like": "heart",
    "repost": "repeat",
    "follow": "user",
    "reply": "message",
    "mention": "at"
  },
  "pages": [
    {
      "id": "notifications",
      "icon": "bell",
      "path": "/notifications",
      "shape": "notifications",
      "count": "/notifications/count",
      "readPath": "/notifications/read"
    },
    {
      "id": "blocked",
      "icon": "lock",
      "path": "/me/lists",
      "shape": "groups"
    },
    {
      "id": "reports",
      "icon": "alert",
      "path": "/reports",
      "shape": "reports",
      "moderator": true
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
      "en-US": "Guyon<span class=\"highlight\">{highlight}</span>",
      "zh-CN": "Guyon<span class=\"highlight\">{highlight}</span>",
      "ar-SA": "Guyon<span class=\"highlight\">{highlight}</span>"
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
    "nav.label": {
      "en-US": "Pages",
      "zh-CN": "页面",
      "ar-SA": "الصفحات"
    },
    "nav.home": {
      "en-US": "Home",
      "zh-CN": "主页",
      "ar-SA": "الرئيسية"
    },
    "nav.following": {
      "en-US": "Following",
      "zh-CN": "关注",
      "ar-SA": "المتابَعون"
    },
    "nav.saved": {
      "en-US": "Saved",
      "zh-CN": "已保存",
      "ar-SA": "المحفوظات"
    },
    "nav.profile": {
      "en-US": "Profile",
      "zh-CN": "个人资料",
      "ar-SA": "الملف الشخصي"
    },
    "search": {
      "en-US": "Search posts and people…",
      "zh-CN": "搜索帖子和用户…",
      "ar-SA": "ابحث في المنشورات والأشخاص…"
    },
    "search.label": {
      "en-US": "Search posts and people",
      "zh-CN": "搜索帖子和用户",
      "ar-SA": "البحث في المنشورات والأشخاص"
    },
    "refresh": {
      "en-US": "Refresh",
      "zh-CN": "刷新",
      "ar-SA": "تحديث"
    },
    "back": {
      "en-US": "Back",
      "zh-CN": "返回",
      "ar-SA": "رجوع"
    },
    "title.home": {
      "en-US": "Home",
      "zh-CN": "主页",
      "ar-SA": "الرئيسية"
    },
    "title.following": {
      "en-US": "Following",
      "zh-CN": "关注",
      "ar-SA": "المتابَعون"
    },
    "title.search": {
      "en-US": "Search: {query}",
      "zh-CN": "搜索：{query}",
      "ar-SA": "بحث: {query}"
    },
    "title.profile": {
      "en-US": "{name}",
      "zh-CN": "{name}",
      "ar-SA": "{name}"
    },
    "title.saved": {
      "en-US": "Saved",
      "zh-CN": "已保存",
      "ar-SA": "المحفوظات"
    },
    "title.thread": {
      "en-US": "Post",
      "zh-CN": "帖子",
      "ar-SA": "منشور"
    },
    "compose.placeholder": {
      "en-US": "What is on your mind?",
      "zh-CN": "你在想什么？",
      "ar-SA": "بماذا تفكر؟"
    },
    "compose.replyPlaceholder": {
      "en-US": "Write your reply",
      "zh-CN": "写下你的回复",
      "ar-SA": "اكتب ردك"
    },
    "compose.label": {
      "en-US": "Write a post",
      "zh-CN": "写帖子",
      "ar-SA": "اكتب منشورًا"
    },
    "compose.new": {
      "en-US": "New post",
      "zh-CN": "发新帖",
      "ar-SA": "منشور جديد"
    },
    "compose.post": {
      "en-US": "Post",
      "zh-CN": "发布",
      "ar-SA": "نشر"
    },
    "compose.reply": {
      "en-US": "Reply",
      "zh-CN": "回复",
      "ar-SA": "رد"
    },
    "compose.counter": {
      "en-US": "{count} / {max}",
      "zh-CN": "{count} / {max}",
      "ar-SA": "{count} / {max}"
    },
    "compose.signIn": {
      "en-US": "Sign in to post, like, and follow.",
      "zh-CN": "登录后即可发帖、点赞和关注。",
      "ar-SA": "سجّل الدخول لتنشر وتعجب وتتابع."
    },
    "login.signIn": {
      "en-US": "Sign in",
      "zh-CN": "登录",
      "ar-SA": "تسجيل الدخول"
    },
    "post.open": {
      "en-US": "Open the post of {name}",
      "zh-CN": "打开 {name} 的帖子",
      "ar-SA": "فتح منشور {name}"
    },
    "post.profile": {
      "en-US": "Open the profile of {name}",
      "zh-CN": "打开 {name} 的个人资料",
      "ar-SA": "فتح الملف الشخصي لـ {name}"
    },
    "post.reply": {
      "en-US": "Reply",
      "zh-CN": "回复",
      "ar-SA": "رد"
    },
    "post.like": {
      "en-US": "Like",
      "zh-CN": "点赞",
      "ar-SA": "إعجاب"
    },
    "post.unlike": {
      "en-US": "Remove the like",
      "zh-CN": "取消点赞",
      "ar-SA": "إزالة الإعجاب"
    },
    "post.delete": {
      "en-US": "Delete the post",
      "zh-CN": "删除帖子",
      "ar-SA": "حذف المنشور"
    },
    "post.deleteConfirm": {
      "en-US": "Delete this post and its replies? This cannot be undone.",
      "zh-CN": "删除这条帖子及其回复？此操作无法撤销。",
      "ar-SA": "حذف هذا المنشور وردوده؟ لا يمكن التراجع عن ذلك."
    },
    "post.deleteOk": {
      "en-US": "Delete",
      "zh-CN": "删除",
      "ar-SA": "حذف"
    },
    "post.deleted": {
      "en-US": "The post was deleted.",
      "zh-CN": "帖子已删除。",
      "ar-SA": "تم حذف المنشور."
    },
    "post.posted": {
      "en-US": "Posted.",
      "zh-CN": "已发布。",
      "ar-SA": "تم النشر."
    },
    "post.replied": {
      "en-US": "Reply sent.",
      "zh-CN": "回复已发送。",
      "ar-SA": "تم إرسال الرد."
    },
    "post.replyingTo": {
      "en-US": "Replying to",
      "zh-CN": "回复",
      "ar-SA": "رد على"
    },
    "post.repost": {
      "en-US": "Repost",
      "zh-CN": "转发",
      "ar-SA": "إعادة نشر"
    },
    "post.unrepost": {
      "en-US": "Undo repost",
      "zh-CN": "撤销转发",
      "ar-SA": "التراجع عن إعادة النشر"
    },
    "post.reposted": {
      "en-US": "{name} reposted",
      "zh-CN": "{name} 转发了",
      "ar-SA": "أعاد {name} النشر"
    },
    "post.repostDone": {
      "en-US": "Reposted.",
      "zh-CN": "已转发。",
      "ar-SA": "تمت إعادة النشر."
    },
    "post.repostUndone": {
      "en-US": "Repost removed.",
      "zh-CN": "已撤销转发。",
      "ar-SA": "تم التراجع عن إعادة النشر."
    },
    "post.share": {
      "en-US": "Copy the link",
      "zh-CN": "复制链接",
      "ar-SA": "نسخ الرابط"
    },
    "post.shared": {
      "en-US": "Link copied.",
      "zh-CN": "链接已复制。",
      "ar-SA": "تم نسخ الرابط."
    },
    "post.shareFailed": {
      "en-US": "Could not copy the link.",
      "zh-CN": "无法复制链接。",
      "ar-SA": "تعذر نسخ الرابط."
    },
    "post.save": {
      "en-US": "Save",
      "zh-CN": "保存",
      "ar-SA": "حفظ"
    },
    "post.unsave": {
      "en-US": "Remove from saved",
      "zh-CN": "取消保存",
      "ar-SA": "إزالة من المحفوظات"
    },
    "post.saveDone": {
      "en-US": "Saved.",
      "zh-CN": "已保存。",
      "ar-SA": "تم الحفظ."
    },
    "post.saveUndone": {
      "en-US": "Removed from saved.",
      "zh-CN": "已取消保存。",
      "ar-SA": "تمت الإزالة من المحفوظات."
    },
    "post.more": {
      "en-US": "More",
      "zh-CN": "更多",
      "ar-SA": "المزيد"
    },
    "post.report": {
      "en-US": "Report the post",
      "zh-CN": "举报帖子",
      "ar-SA": "الإبلاغ عن المنشور"
    },
    "post.mute": {
      "en-US": "Mute @{login}",
      "zh-CN": "静音 @{login}",
      "ar-SA": "كتم @{login}"
    },
    "post.block": {
      "en-US": "Block @{login}",
      "zh-CN": "屏蔽 @{login}",
      "ar-SA": "حظر @{login}"
    },
    "post.moderatorDelete": {
      "en-US": "Delete as moderator",
      "zh-CN": "以管理员身份删除",
      "ar-SA": "الحذف كمشرف"
    },
    "report.prompt": {
      "en-US": "Why do you report this post? You can leave it empty.",
      "zh-CN": "你为什么举报这条帖子？可以留空。",
      "ar-SA": "لماذا تبلّغ عن هذا المنشور؟ يمكنك تركه فارغًا."
    },
    "report.sent": {
      "en-US": "Thanks. The moderators will look at it.",
      "zh-CN": "谢谢，管理员会查看。",
      "ar-SA": "شكرًا. سينظر المشرفون في الأمر."
    },
    "report.by": {
      "en-US": "Reported by @{login}",
      "zh-CN": "举报人 @{login}",
      "ar-SA": "أبلغ عنه @{login}"
    },
    "report.reason": {
      "en-US": "Reason: {reason}",
      "zh-CN": "原因：{reason}",
      "ar-SA": "السبب: {reason}"
    },
    "report.noReason": {
      "en-US": "No reason given.",
      "zh-CN": "未说明原因。",
      "ar-SA": "لم يُذكر سبب."
    },
    "report.delete": {
      "en-US": "Delete the post",
      "zh-CN": "删除帖子",
      "ar-SA": "حذف المنشور"
    },
    "report.dismiss": {
      "en-US": "Dismiss",
      "zh-CN": "忽略",
      "ar-SA": "تجاهل"
    },
    "report.dismissed": {
      "en-US": "Report dismissed.",
      "zh-CN": "已忽略举报。",
      "ar-SA": "تم تجاهل البلاغ."
    },
    "mute.on": {
      "en-US": "Muted @{login}. Their posts are hidden from your timelines.",
      "zh-CN": "已静音 @{login}，其帖子不会出现在你的时间线中。",
      "ar-SA": "تم كتم @{login}. منشوراته مخفية من خطوطك الزمنية."
    },
    "mute.off": {
      "en-US": "Unmuted @{login}.",
      "zh-CN": "已取消静音 @{login}。",
      "ar-SA": "تم إلغاء كتم @{login}."
    },
    "block.on": {
      "en-US": "Blocked @{login}.",
      "zh-CN": "已屏蔽 @{login}。",
      "ar-SA": "تم حظر @{login}."
    },
    "block.off": {
      "en-US": "Unblocked @{login}.",
      "zh-CN": "已取消屏蔽 @{login}。",
      "ar-SA": "تم إلغاء حظر @{login}."
    },
    "block.confirm": {
      "en-US": "Block @{login}? You will not see each other's posts, you cannot interact, and you stop following each other.",
      "zh-CN": "屏蔽 @{login}？你们将看不到对方的帖子，无法互动，并互相取消关注。",
      "ar-SA": "حظر @{login}؟ لن ترى منشورات بعضكما ولن تتمكنا من التفاعل وسيتوقف كلاكما عن متابعة الآخر."
    },
    "block.ok": {
      "en-US": "Block",
      "zh-CN": "屏蔽",
      "ar-SA": "حظر"
    },
    "profile.mute": {
      "en-US": "Mute",
      "zh-CN": "静音",
      "ar-SA": "كتم"
    },
    "profile.unmute": {
      "en-US": "Unmute",
      "zh-CN": "取消静音",
      "ar-SA": "إلغاء الكتم"
    },
    "profile.block": {
      "en-US": "Block",
      "zh-CN": "屏蔽",
      "ar-SA": "حظر"
    },
    "profile.unblock": {
      "en-US": "Unblock",
      "zh-CN": "取消屏蔽",
      "ar-SA": "إلغاء الحظر"
    },
    "nav.blocked": {
      "en-US": "Blocked and muted",
      "zh-CN": "已屏蔽和已静音",
      "ar-SA": "المحظورون والمكتومون"
    },
    "title.blocked": {
      "en-US": "Blocked and muted",
      "zh-CN": "已屏蔽和已静音",
      "ar-SA": "المحظورون والمكتومون"
    },
    "nav.reports": {
      "en-US": "Reports",
      "zh-CN": "举报",
      "ar-SA": "البلاغات"
    },
    "title.reports": {
      "en-US": "Reports",
      "zh-CN": "举报",
      "ar-SA": "البلاغات"
    },
    "group.blocked": {
      "en-US": "Blocked",
      "zh-CN": "已屏蔽",
      "ar-SA": "المحظورون"
    },
    "group.muted": {
      "en-US": "Muted",
      "zh-CN": "已静音",
      "ar-SA": "المكتومون"
    },
    "empty.blockedTitle": {
      "en-US": "No one blocked or muted",
      "zh-CN": "没有屏蔽或静音的用户",
      "ar-SA": "لا أحد محظور أو مكتوم"
    },
    "empty.blockedText": {
      "en-US": "People you block or mute show up here, so you can undo it.",
      "zh-CN": "你屏蔽或静音的用户会显示在这里，方便你撤销。",
      "ar-SA": "يظهر هنا من تحظره أو تكتمه لتتمكن من التراجع."
    },
    "empty.blockedSignedOut": {
      "en-US": "Sign in to see who you blocked or muted",
      "zh-CN": "登录以查看你屏蔽或静音的用户",
      "ar-SA": "سجّل الدخول لرؤية من حظرتهم أو كتمتهم"
    },
    "empty.reportsTitle": {
      "en-US": "No reports",
      "zh-CN": "没有举报",
      "ar-SA": "لا توجد بلاغات"
    },
    "empty.reportsText": {
      "en-US": "Reported posts show up here for the moderators.",
      "zh-CN": "被举报的帖子会显示在这里，供管理员查看。",
      "ar-SA": "تظهر هنا المنشورات المبلّغ عنها للمشرفين."
    },
    "empty.reportsSignedOut": {
      "en-US": "Sign in to see the reports",
      "zh-CN": "登录以查看举报",
      "ar-SA": "سجّل الدخول لرؤية البلاغات"
    },
    "error.blocked": {
      "en-US": "A block between you and this person stops this.",
      "zh-CN": "你与此人之间存在屏蔽，无法执行此操作。",
      "ar-SA": "هناك حظر بينك وبين هذا الشخص يمنع ذلك."
    },
    "error.moderator": {
      "en-US": "Only the moderators can do this.",
      "zh-CN": "只有管理员可以这样做。",
      "ar-SA": "هذا الإجراء للمشرفين فقط."
    },
    "error.owner": {
      "en-US": "You can only delete your own posts.",
      "zh-CN": "你只能删除自己的帖子。",
      "ar-SA": "يمكنك حذف منشوراتك فقط."
    },
    "error.self": {
      "en-US": "You cannot do this to yourself.",
      "zh-CN": "你不能对自己这样做。",
      "ar-SA": "لا يمكنك فعل ذلك بنفسك."
    },
    "nav.notifications": {
      "en-US": "Notifications",
      "zh-CN": "通知",
      "ar-SA": "الإشعارات"
    },
    "title.notifications": {
      "en-US": "Notifications",
      "zh-CN": "通知",
      "ar-SA": "الإشعارات"
    },
    "notification.like": {
      "en-US": "liked your post",
      "zh-CN": "赞了你的帖子",
      "ar-SA": "أعجب بمنشورك"
    },
    "notification.repost": {
      "en-US": "reposted your post",
      "zh-CN": "转发了你的帖子",
      "ar-SA": "أعاد نشر منشورك"
    },
    "notification.follow": {
      "en-US": "followed you",
      "zh-CN": "关注了你",
      "ar-SA": "بدأ بمتابعتك"
    },
    "notification.reply": {
      "en-US": "replied to your post",
      "zh-CN": "回复了你的帖子",
      "ar-SA": "ردّ على منشورك"
    },
    "notification.mention": {
      "en-US": "mentioned you",
      "zh-CN": "提到了你",
      "ar-SA": "أشار إليك"
    },
    "empty.notificationsTitle": {
      "en-US": "No notifications yet",
      "zh-CN": "还没有通知",
      "ar-SA": "لا توجد إشعارات بعد"
    },
    "empty.notificationsText": {
      "en-US": "Likes, replies, reposts, follows, and mentions show up here.",
      "zh-CN": "点赞、回复、转发、关注和提及会显示在这里。",
      "ar-SA": "تظهر هنا الإعجابات والردود وإعادات النشر والمتابعات والإشارات."
    },
    "empty.notificationsSignedOut": {
      "en-US": "Sign in to see your notifications",
      "zh-CN": "登录以查看你的通知",
      "ar-SA": "سجّل الدخول لرؤية إشعاراتك"
    },
    "compose.addImage": {
      "en-US": "Add an image",
      "zh-CN": "添加图片",
      "ar-SA": "إضافة صورة"
    },
    "compose.removeImage": {
      "en-US": "Remove the image",
      "zh-CN": "移除图片",
      "ar-SA": "إزالة الصورة"
    },
    "image.limit": {
      "en-US": "You can add at most {max} images.",
      "zh-CN": "最多可添加 {max} 张图片。",
      "ar-SA": "يمكنك إضافة {max} صور كحد أقصى."
    },
    "image.type": {
      "en-US": "Only JPEG, PNG, WebP, and GIF images can be added.",
      "zh-CN": "只能添加 JPEG、PNG、WebP 和 GIF 图片。",
      "ar-SA": "يمكن إضافة صور JPEG وPNG وWebP وGIF فقط."
    },
    "image.tooBig": {
      "en-US": "This image is too big, even after it is made smaller. The most is {size}.",
      "zh-CN": "这张图片即使压缩后仍然太大，上限为 {size}。",
      "ar-SA": "هذه الصورة كبيرة جدًا حتى بعد تصغيرها. الحد الأقصى {size}."
    },
    "image.view": {
      "en-US": "Open the image",
      "zh-CN": "打开图片",
      "ar-SA": "فتح الصورة"
    },
    "error.type": {
      "en-US": "This file is not a supported image.",
      "zh-CN": "此文件不是受支持的图片。",
      "ar-SA": "هذا الملف ليس صورة مدعومة."
    },
    "error.size": {
      "en-US": "This image is too big.",
      "zh-CN": "这张图片太大了。",
      "ar-SA": "هذه الصورة كبيرة جدًا."
    },
    "post.edit": {
      "en-US": "Edit the post",
      "zh-CN": "编辑帖子",
      "ar-SA": "تعديل المنشور"
    },
    "post.editSaved": {
      "en-US": "Post updated.",
      "zh-CN": "帖子已更新。",
      "ar-SA": "تم تحديث المنشور."
    },
    "post.edited": {
      "en-US": "edited",
      "zh-CN": "已编辑",
      "ar-SA": "معدَّل"
    },
    "post.showMore": {
      "en-US": "Show more",
      "zh-CN": "显示更多",
      "ar-SA": "عرض المزيد"
    },
    "compose.edit": {
      "en-US": "Edit post",
      "zh-CN": "编辑帖子",
      "ar-SA": "تعديل المنشور"
    },
    "compose.save": {
      "en-US": "Save",
      "zh-CN": "保存",
      "ar-SA": "حفظ"
    },
    "tabs.home": {
      "en-US": "For you",
      "zh-CN": "为你推荐",
      "ar-SA": "لك"
    },
    "tabs.following": {
      "en-US": "Following",
      "zh-CN": "关注",
      "ar-SA": "المتابَعون"
    },
    "error.window": {
      "en-US": "The time to edit this post has passed.",
      "zh-CN": "编辑这条帖子的时间已过。",
      "ar-SA": "انتهى وقت تعديل هذا المنشور."
    },
    "post.notFound": {
      "en-US": "This post does not exist any more.",
      "zh-CN": "这条帖子已不存在。",
      "ar-SA": "هذا المنشور لم يعد موجودًا."
    },
    "time.now": {
      "en-US": "now",
      "zh-CN": "刚刚",
      "ar-SA": "الآن"
    },
    "empty.homeTitle": {
      "en-US": "No posts yet",
      "zh-CN": "还没有帖子",
      "ar-SA": "لا توجد منشورات بعد"
    },
    "empty.homeText": {
      "en-US": "Be the first to post something.",
      "zh-CN": "来发第一条帖子吧。",
      "ar-SA": "كن أول من ينشر شيئًا."
    },
    "empty.followingTitle": {
      "en-US": "Nothing from the people you follow",
      "zh-CN": "你关注的人还没有发帖",
      "ar-SA": "لا شيء من الأشخاص الذين تتابعهم"
    },
    "empty.followingText": {
      "en-US": "Follow people from their profile and their posts show up here.",
      "zh-CN": "在用户的个人资料页关注他们，帖子就会显示在这里。",
      "ar-SA": "تابع الأشخاص من ملفاتهم وستظهر منشوراتهم هنا."
    },
    "empty.followingSignedOut": {
      "en-US": "Sign in to see the people you follow",
      "zh-CN": "登录以查看你关注的人",
      "ar-SA": "سجّل الدخول لرؤية من تتابعهم"
    },
    "empty.savedTitle": {
      "en-US": "Nothing saved yet",
      "zh-CN": "还没有保存的帖子",
      "ar-SA": "لا شيء محفوظ بعد"
    },
    "empty.savedText": {
      "en-US": "Save a post with the bookmark under it and it stays here, only for you.",
      "zh-CN": "用帖子下方的书签保存帖子，它会留在这里，只有你能看到。",
      "ar-SA": "احفظ منشورًا بعلامة الحفظ أسفله وسيبقى هنا، لك وحدك."
    },
    "empty.savedSignedOut": {
      "en-US": "Sign in to see your saved posts",
      "zh-CN": "登录以查看已保存的帖子",
      "ar-SA": "سجّل الدخول لرؤية منشوراتك المحفوظة"
    },
    "empty.searchTitle": {
      "en-US": "Nothing found",
      "zh-CN": "没有找到内容",
      "ar-SA": "لم يتم العثور على شيء"
    },
    "empty.searchText": {
      "en-US": "No post matches \"{query}\".",
      "zh-CN": "没有与“{query}”匹配的帖子。",
      "ar-SA": "لا يوجد منشور يطابق \"{query}\"."
    },
    "empty.profileTitle": {
      "en-US": "No posts yet",
      "zh-CN": "还没有帖子",
      "ar-SA": "لا توجد منشورات بعد"
    },
    "empty.profileText": {
      "en-US": "{name} has not posted anything.",
      "zh-CN": "{name} 还没有发过帖子。",
      "ar-SA": "لم ينشر {name} أي شيء."
    },
    "empty.repliesTitle": {
      "en-US": "No replies yet",
      "zh-CN": "还没有回复",
      "ar-SA": "لا توجد ردود بعد"
    },
    "empty.repliesText": {
      "en-US": "Be the first to reply.",
      "zh-CN": "来发第一条回复吧。",
      "ar-SA": "كن أول من يرد."
    },
    "loading": {
      "en-US": "Loading…",
      "zh-CN": "正在加载…",
      "ar-SA": "جارٍ التحميل…"
    },
    "load.more": {
      "en-US": "Show more",
      "zh-CN": "显示更多",
      "ar-SA": "عرض المزيد"
    },
    "people.title": {
      "en-US": "People",
      "zh-CN": "用户",
      "ar-SA": "الأشخاص"
    },
    "profile.follow": {
      "en-US": "Follow",
      "zh-CN": "关注",
      "ar-SA": "متابعة"
    },
    "profile.unfollow": {
      "en-US": "Following",
      "zh-CN": "已关注",
      "ar-SA": "تتابعه"
    },
    "profile.edit": {
      "en-US": "Edit bio",
      "zh-CN": "编辑简介",
      "ar-SA": "تعديل النبذة"
    },
    "profile.bioPrompt": {
      "en-US": "Write a short bio.",
      "zh-CN": "写一段简短的简介。",
      "ar-SA": "اكتب نبذة قصيرة."
    },
    "profile.bioSaved": {
      "en-US": "Bio saved.",
      "zh-CN": "简介已保存。",
      "ar-SA": "تم حفظ النبذة."
    },
    "profile.noBio": {
      "en-US": "No bio yet.",
      "zh-CN": "还没有简介。",
      "ar-SA": "لا توجد نبذة بعد."
    },
    "profile.posts": {
      "en-US": "Posts: {count}",
      "zh-CN": "帖子：{count}",
      "ar-SA": "المنشورات: {count}"
    },
    "profile.followers": {
      "en-US": "Followers: {count}",
      "zh-CN": "关注者：{count}",
      "ar-SA": "المتابِعون: {count}"
    },
    "profile.following": {
      "en-US": "Following: {count}",
      "zh-CN": "正在关注：{count}",
      "ar-SA": "يتابع: {count}"
    },
    "profile.joined": {
      "en-US": "Joined {date}",
      "zh-CN": "加入于 {date}",
      "ar-SA": "انضم في {date}"
    },
    "profile.notFound": {
      "en-US": "This person has not joined Guyonmu.",
      "zh-CN": "这位用户还没有加入 Guyonmu。",
      "ar-SA": "هذا الشخص لم ينضم إلى Guyonmu."
    },
    "profile.deleteData": {
      "en-US": "Delete my data",
      "zh-CN": "删除我的数据",
      "ar-SA": "حذف بياناتي"
    },
    "profile.deleteDataConfirm": {
      "en-US": "Delete your profile, your posts, your likes, and your follows from Guyonmu? Your GitHub account is not touched. This cannot be undone.",
      "zh-CN": "从 Guyonmu 删除你的资料、帖子、点赞和关注？你的 GitHub 账户不受影响。此操作无法撤销。",
      "ar-SA": "حذف ملفك ومنشوراتك وإعجاباتك ومتابعاتك من Guyonmu؟ حساب GitHub الخاص بك لن يتأثر. لا يمكن التراجع عن ذلك."
    },
    "profile.deleteDataOk": {
      "en-US": "Delete everything",
      "zh-CN": "全部删除",
      "ar-SA": "حذف كل شيء"
    },
    "profile.dataDeleted": {
      "en-US": "Your data was deleted from Guyonmu.",
      "zh-CN": "你的数据已从 Guyonmu 删除。",
      "ar-SA": "تم حذف بياناتك من Guyonmu."
    },
    "status.signedOut": {
      "en-US": "Sign in to post.",
      "zh-CN": "登录后即可发帖。",
      "ar-SA": "سجّل الدخول للنشر."
    },
    "status.signedIn": {
      "en-US": "Signed in as @{login}",
      "zh-CN": "已登录为 @{login}",
      "ar-SA": "تم تسجيل الدخول باسم @{login}"
    },
    "error.network": {
      "en-US": "Could not reach Guyonmu. Check your connection.",
      "zh-CN": "无法连接到 Guyonmu，请检查网络。",
      "ar-SA": "تعذر الاتصال بـ Guyonmu. تحقق من اتصالك."
    },
    "error.generic": {
      "en-US": "Something went wrong. Try again.",
      "zh-CN": "出错了，请重试。",
      "ar-SA": "حدث خطأ ما. حاول مرة أخرى."
    },
    "error.length": {
      "en-US": "This is too long.",
      "zh-CN": "内容太长了。",
      "ar-SA": "هذا النص طويل جدًا."
    },
    "error.empty": {
      "en-US": "Write something first.",
      "zh-CN": "请先写点内容。",
      "ar-SA": "اكتب شيئًا أولًا."
    },
    "error.rate": {
      "en-US": "You are posting too fast. Wait a moment.",
      "zh-CN": "发帖太快了，请稍等一下。",
      "ar-SA": "أنت تنشر بسرعة كبيرة. انتظر قليلًا."
    },
    "error.github": {
      "en-US": "GitHub did not accept your sign-in.",
      "zh-CN": "GitHub 未接受你的登录。",
      "ar-SA": "لم يقبل GitHub تسجيل دخولك."
    },
    "error.session": {
      "en-US": "Your session ended. Try again.",
      "zh-CN": "会话已结束，请重试。",
      "ar-SA": "انتهت جلستك. حاول مرة أخرى."
    },
    "acct.tokenInvalid": {
      "en-US": "The sign-in of {name} has ended. Sign in again.",
      "zh-CN": "{name} 的登录已失效，请重新登录。",
      "ar-SA": "انتهى تسجيل دخول {name}. سجّل الدخول مرة أخرى."
    },
    "acct.anAccount": {
      "en-US": "your account",
      "zh-CN": "你的账户",
      "ar-SA": "حسابك"
    }
  }
};
