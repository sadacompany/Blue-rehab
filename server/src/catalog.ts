export function previewCatalog() {
  const specialistIds = ["preview-sports", "preview-orthopedic", "preview-neuro"];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(10, 0, 0, 0);
  const nextDay = new Date(Date.now() + 48 * 60 * 60 * 1000);
  nextDay.setHours(17, 30, 0, 0);
  return {
    source: "preview",
    services: [
      { id: "preview-followup", name: "جلسة متابعة عن بُعد", description: "مراجعة الالتزام والتغير في الأعراض وأداء التمارين، مع تعديل التعليمات عندما تسمح طبيعة الحالة بالمتابعة المرئية.", durationMinutes: 30, price: 150, modes: ["remote"], isDemo: true },
      { id: "preview-treatment", name: "جلسة علاج طبيعي", description: "تنفيذ التدخلات المحددة في الخطة، وتسجيل الاستجابة، وتحديث التمارين والتعليمات وفق نتائج الجلسة.", durationMinutes: 45, price: 200, modes: ["clinic"], isDemo: true },
      { id: "preview-assessment", name: "جلسة تشخيص أولية", description: "مراجعة التاريخ الصحي والأعراض، وفحص الحركة والوظيفة ضمن نطاق العلاج الطبيعي، ثم توثيق الانطباع السريري والخطوات المقترحة.", durationMinutes: 60, price: 250, modes: ["clinic", "remote"], isDemo: true },
    ],
    specialists: [
      { id: specialistIds[0], name: "ملف تجريبي — التأهيل الرياضي", title: "أخصائية إصابات رياضية وتأهيل", bio: "نموذج لملف مقدم خدمة في تقييم إصابات النشاط الحركي وبناء التدرج التأهيلي. لا يمثل مختصاً منشوراً.", specialties: ["إصابات رياضية", "تأهيل الركبة"], languages: ["العربية"], isVerified: false, isDemo: true },
      { id: specialistIds[1], name: "ملف تجريبي — العظام والمفاصل", title: "أخصائي تأهيل العظام والمفاصل", bio: "نموذج لملف مقدم خدمة في برامج ما بعد الإجراءات الجراحية وحالات العظام والمفاصل. لا يمثل مختصاً منشوراً.", specialties: ["العظام", "المفاصل"], languages: ["العربية"], isVerified: false, isDemo: true },
      { id: specialistIds[2], name: "ملف تجريبي — التأهيل العصبي", title: "أخصائية علاج طبيعي عصبي", bio: "نموذج لملف مقدم خدمة في التأهيل العصبي الوظيفي. لا يمثل مختصاً منشوراً.", specialties: ["التأهيل العصبي"], languages: ["العربية"], isVerified: false, isDemo: true },
    ],
    courses: [
      { id: "preview-knee", slug: "advanced-knee-rehab", title: "التأهيل المتقدم لإصابات الركبة", summary: "تطبيقات عملية لتقييم وتأهيل إصابات الركبة.", description: "برنامج تطبيقي يشرح بناء مسار تأهيلي متدرج لإصابات الركبة.", durationHours: 12, price: 690, mode: "onsite", level: "متوسط", startsAt: null, learningOutcomes: ["تمييز مراحل التأهيل", "بناء تدرج آمن للتمارين"], prerequisites: ["طالب أو ممارس في تخصص صحي ذي صلة"], language: "العربية", certificateAvailable: true, isDemo: true },
      { id: "preview-manual", slug: "clinical-manual-therapy", title: "أساسيات العلاج اليدوي السريري", summary: "مدخل عملي آمن لمهارات العلاج اليدوي.", description: "مدخل منظم إلى التفكير السريري المصاحب للتقنيات اليدوية.", durationHours: 16, price: 850, mode: "hybrid", level: "مبتدئ", startsAt: null, learningOutcomes: ["فهم مبادئ الفحص السريري", "توثيق الاستجابة"], prerequisites: ["طالب أو ممارس في تخصص صحي ذي صلة"], language: "العربية", certificateAvailable: true, isDemo: true },
      { id: "preview-movement", slug: "functional-movement-analysis", title: "قراءة وتحليل الحركة الوظيفية", summary: "أسس الملاحظة والتحليل وصناعة القرار السريري.", description: "برنامج يربط الملاحظة المنظمة باختبارات الحركة الوظيفية.", durationHours: 8, price: 420, mode: "remote", level: "متقدم", startsAt: null, learningOutcomes: ["ملاحظة أنماط الحركة", "صياغة خطة قياس"], prerequisites: ["طالب أو ممارس في تخصص صحي ذي صلة"], language: "العربية", certificateAvailable: true, isDemo: true },
    ],
    branches: [{ id: "preview-branch", name: "فرع تجريبي — يحدد قبل الإطلاق", city: "الرياض", address: null, isDemo: true }],
    availability: [
      { id: "preview-slot-1", specialistId: specialistIds[0], branchId: "preview-branch", startsAt: tomorrow.toISOString(), endsAt: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(), mode: "clinic" },
      { id: "preview-slot-2", specialistId: specialistIds[0], branchId: null, startsAt: nextDay.toISOString(), endsAt: new Date(nextDay.getTime() + 30 * 60 * 1000).toISOString(), mode: "remote" },
      { id: "preview-slot-3", specialistId: specialistIds[1], branchId: "preview-branch", startsAt: nextDay.toISOString(), endsAt: new Date(nextDay.getTime() + 45 * 60 * 1000).toISOString(), mode: "clinic" },
    ],
  };
}

export function previewCourseDetail(slug: string) {
  const catalog = previewCatalog();
  const course = catalog.courses.find((item) => item.slug === slug) ?? catalog.courses[0];
  return {
    source: "preview",
    course,
    modules: [
      { id: "preview-module-1", title: "التقييم وبناء خط الأساس", summary: "جمع المعلومات وترتيب مؤشرات الفحص قبل اختيار التدخل.", position: 1, lessons: [{ id: "preview-lesson-1", title: "مبادئ التقييم المنظم", contentType: "video", durationMinutes: 18, isPreview: true }] },
      { id: "preview-module-2", title: "اختيار التدرج والجرعة", summary: "تحويل الهدف إلى تدرج يمكن قياسه وتعديله.", position: 2, lessons: [] },
      { id: "preview-module-3", title: "التوثيق والمراجعة", summary: "قياس الاستجابة وتوثيق سبب الاستمرار أو التعديل.", position: 3, lessons: [] },
    ],
  };
}
