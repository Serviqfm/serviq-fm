// web/src/lib/field-catalog.ts
//
// Source of truth for which form fields exist on each form across the
// dashboard, and their default visibility settings. Consumed by:
//   - server-side enforceFieldConfig() (knows which fields are NOT NULL)
//   - useFieldConfig() hook (via the API)
//   - Settings UI (renders the per-page field list)
//   - Seed script (populates field_configs rows)

export type FieldVisibility = 'required' | 'optional' | 'hidden'

export type FieldType =
  | 'text' | 'textarea' | 'select' | 'date' | 'datetime'
  | 'number' | 'file' | 'checkbox'

export type FieldPage =
  | 'work_orders_new'
  | 'work_orders_edit'
  | 'work_orders_close'
  | 'assets_new'
  | 'assets_edit'
  | 'sites_new'
  | 'sites_edit'
  | 'spaces_new'
  | 'spaces_edit'
  | 'users_new'
  | 'users_edit'

export const ALL_PAGES: FieldPage[] = [
  'work_orders_new', 'work_orders_edit', 'work_orders_close',
  'assets_new', 'assets_edit',
  'sites_new', 'sites_edit',
  'spaces_new', 'spaces_edit',
  'users_new', 'users_edit',
]

export type FieldMeta = {
  key: string
  label_en: string
  label_ar: string
  type: FieldType
  default_visibility: FieldVisibility
  is_system_required: boolean
}

export const PAGE_LABELS: Record<FieldPage, { en: string; ar: string }> = {
  work_orders_new:   { en: 'Create Work Order',   ar: 'إنشاء أمر عمل' },
  work_orders_edit:  { en: 'Edit Work Order',     ar: 'تعديل أمر العمل' },
  work_orders_close: { en: 'Close Work Order',    ar: 'إغلاق أمر العمل' },
  assets_new:        { en: 'Create Asset',        ar: 'إنشاء أصل' },
  assets_edit:       { en: 'Edit Asset',          ar: 'تعديل الأصل' },
  sites_new:         { en: 'Create Site',         ar: 'إنشاء موقع' },
  sites_edit:        { en: 'Edit Site',           ar: 'تعديل الموقع' },
  spaces_new:        { en: 'Create Space',        ar: 'إنشاء مساحة' },
  spaces_edit:       { en: 'Edit Space',          ar: 'تعديل المساحة' },
  users_new:         { en: 'Create User',         ar: 'إنشاء مستخدم' },
  users_edit:        { en: 'Edit User',           ar: 'تعديل المستخدم' },
}

export const FIELD_CATALOG: Record<FieldPage, FieldMeta[]> = {
  work_orders_new: [
    { key: 'title',                  label_en: 'Title',                label_ar: 'العنوان',           type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'description',            label_en: 'Description',          label_ar: 'الوصف',             type: 'textarea', default_visibility: 'optional', is_system_required: false },
    { key: 'priority',               label_en: 'Priority',             label_ar: 'الأولوية',          type: 'select',   default_visibility: 'required', is_system_required: false },
    { key: 'category',               label_en: 'Category',             label_ar: 'الفئة',             type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'site_id',                label_en: 'Site',                 label_ar: 'الموقع',            type: 'select',   default_visibility: 'required', is_system_required: true  },
    { key: 'asset_id',               label_en: 'Asset',                label_ar: 'الأصل',             type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'assigned_to',            label_en: 'Assigned to',          label_ar: 'مسند إلى',          type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'due_at',                 label_en: 'Due date',             label_ar: 'تاريخ الاستحقاق',   type: 'date',     default_visibility: 'optional', is_system_required: false },
    { key: 'sla_hours',              label_en: 'SLA hours',            label_ar: 'ساعات SLA',         type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'is_recurring',           label_en: 'Recurring',            label_ar: 'متكرر',             type: 'checkbox', default_visibility: 'optional', is_system_required: false },
    { key: 'recurrence_frequency',   label_en: 'Recurrence frequency', label_ar: 'تكرار',             type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'photos',                 label_en: 'Photos',               label_ar: 'الصور',             type: 'file',     default_visibility: 'optional', is_system_required: false },
  ],
  work_orders_edit: [
    { key: 'title',            label_en: 'Title',            label_ar: 'العنوان',           type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'description',      label_en: 'Description',      label_ar: 'الوصف',             type: 'textarea', default_visibility: 'optional', is_system_required: false },
    { key: 'priority',         label_en: 'Priority',         label_ar: 'الأولوية',          type: 'select',   default_visibility: 'required', is_system_required: false },
    { key: 'category',         label_en: 'Category',         label_ar: 'الفئة',             type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'site_id',          label_en: 'Site',             label_ar: 'الموقع',            type: 'select',   default_visibility: 'required', is_system_required: true  },
    { key: 'asset_id',         label_en: 'Asset',            label_ar: 'الأصل',             type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'assigned_to',      label_en: 'Assigned to',      label_ar: 'مسند إلى',          type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'sla_hours',        label_en: 'SLA hours',        label_ar: 'ساعات SLA',         type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'due_at',           label_en: 'Due date',         label_ar: 'تاريخ الاستحقاق',   type: 'datetime', default_visibility: 'optional', is_system_required: false },
    { key: 'actual_cost',      label_en: 'Actual cost',      label_ar: 'التكلفة الفعلية',   type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'completion_notes', label_en: 'Completion notes', label_ar: 'ملاحظات الإكمال',   type: 'textarea', default_visibility: 'optional', is_system_required: false },
  ],
  work_orders_close: [
    { key: 'closeout_photos', label_en: 'Close-out photos', label_ar: 'صور الإغلاق', type: 'file', default_visibility: 'required', is_system_required: true },
  ],
  assets_new: [
    { key: 'name',                    label_en: 'Name',                    label_ar: 'الاسم',                 type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'category',                label_en: 'Category',                label_ar: 'الفئة',                 type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'site_id',                 label_en: 'Site',                    label_ar: 'الموقع',                type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'sub_location',            label_en: 'Sub-location',            label_ar: 'الموقع الفرعي',         type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'serial_number',           label_en: 'Serial number',           label_ar: 'الرقم التسلسلي',        type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'manufacturer',            label_en: 'Manufacturer',            label_ar: 'الصانع',                type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'model',                   label_en: 'Model',                   label_ar: 'الموديل',               type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'purchase_date',           label_en: 'Purchase date',           label_ar: 'تاريخ الشراء',          type: 'date',     default_visibility: 'optional', is_system_required: false },
    { key: 'purchase_cost',           label_en: 'Purchase cost',           label_ar: 'تكلفة الشراء',          type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'warranty_expiry',         label_en: 'Warranty expiry',         label_ar: 'انتهاء الضمان',         type: 'date',     default_visibility: 'optional', is_system_required: false },
    { key: 'expected_lifespan_years', label_en: 'Expected lifespan (yrs)', label_ar: 'العمر المتوقع (سنوات)', type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'description',             label_en: 'Description',             label_ar: 'الوصف',                 type: 'textarea', default_visibility: 'optional', is_system_required: false },
    { key: 'location_notes',          label_en: 'Location notes',          label_ar: 'ملاحظات الموقع',        type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'photos',                  label_en: 'Photos',                  label_ar: 'الصور',                 type: 'file',     default_visibility: 'optional', is_system_required: false },
  ],
  assets_edit: [
    { key: 'name',                    label_en: 'Asset name',              label_ar: 'اسم الأصل',             type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'category',                label_en: 'Category',                label_ar: 'الفئة',                 type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'site_id',                 label_en: 'Site',                    label_ar: 'الموقع',                type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'sub_location',            label_en: 'Sub-location',            label_ar: 'الموقع الفرعي',         type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'location_notes',          label_en: 'Location notes',          label_ar: 'ملاحظات الموقع',        type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'manufacturer',            label_en: 'Manufacturer',            label_ar: 'الصانع',                type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'model',                   label_en: 'Model',                   label_ar: 'الموديل',               type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'serial_number',           label_en: 'Serial number',           label_ar: 'الرقم التسلسلي',        type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'purchase_date',           label_en: 'Purchase date',           label_ar: 'تاريخ الشراء',          type: 'date',     default_visibility: 'optional', is_system_required: false },
    { key: 'purchase_cost',           label_en: 'Purchase cost',           label_ar: 'تكلفة الشراء',          type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'warranty_expiry',         label_en: 'Warranty expiry',         label_ar: 'انتهاء الضمان',         type: 'date',     default_visibility: 'optional', is_system_required: false },
    { key: 'expected_lifespan_years', label_en: 'Expected lifespan (yrs)', label_ar: 'العمر المتوقع (سنوات)', type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'description',             label_en: 'Description',             label_ar: 'الوصف',                 type: 'textarea', default_visibility: 'optional', is_system_required: false },
  ],
  sites_new: [
    { key: 'name',      label_en: 'Site name (English)', label_ar: 'اسم الموقع (إنجليزي)', type: 'text',   default_visibility: 'required', is_system_required: true  },
    { key: 'name_ar',   label_en: 'Site name (Arabic)',  label_ar: 'اسم الموقع (عربي)',    type: 'text',   default_visibility: 'optional', is_system_required: false },
    { key: 'city',      label_en: 'City',                label_ar: 'المدينة',              type: 'text',   default_visibility: 'optional', is_system_required: false },
    { key: 'address',   label_en: 'Address',             label_ar: 'العنوان',              type: 'text',   default_visibility: 'optional', is_system_required: false },
    { key: 'latitude',  label_en: 'Latitude',            label_ar: 'خط العرض',             type: 'number', default_visibility: 'optional', is_system_required: false },
    { key: 'longitude', label_en: 'Longitude',           label_ar: 'خط الطول',             type: 'number', default_visibility: 'optional', is_system_required: false },
  ],
  sites_edit: [
    { key: 'name',              label_en: 'Site name (English)',          label_ar: 'اسم الموقع (إنجليزي)',     type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'name_ar',           label_en: 'Site name (Arabic)',           label_ar: 'اسم الموقع (عربي)',        type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'city',              label_en: 'City',                         label_ar: 'المدينة',                  type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'address',           label_en: 'Address',                      label_ar: 'العنوان',                  type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'latitude',          label_en: 'Latitude',                     label_ar: 'خط العرض',                 type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'longitude',         label_en: 'Longitude',                    label_ar: 'خط الطول',                 type: 'number',   default_visibility: 'optional', is_system_required: false },
    { key: 'assigned_team_id',  label_en: 'Assigned team',                label_ar: 'الفريق المسؤول',           type: 'select',   default_visibility: 'optional', is_system_required: false },
    { key: 'invoicing_enabled', label_en: 'Enable invoicing for this site', label_ar: 'تفعيل الفوترة لهذا الموقع', type: 'checkbox', default_visibility: 'optional', is_system_required: false },
  ],
  spaces_new: [
    { key: 'name',        label_en: 'Name (EN)',   label_ar: 'الاسم (إنجليزي)', type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'name_ar',     label_en: 'Name (AR)',   label_ar: 'الاسم (عربي)',    type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'floor',       label_en: 'Floor',       label_ar: 'الطابق',          type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'description', label_en: 'Description', label_ar: 'الوصف',           type: 'textarea', default_visibility: 'optional', is_system_required: false },
  ],
  spaces_edit: [
    { key: 'name',        label_en: 'Name (EN)',   label_ar: 'الاسم (إنجليزي)', type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'name_ar',     label_en: 'Name (AR)',   label_ar: 'الاسم (عربي)',    type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'floor',       label_en: 'Floor',       label_ar: 'الطابق',          type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'description', label_en: 'Description', label_ar: 'الوصف',           type: 'textarea', default_visibility: 'optional', is_system_required: false },
  ],
  users_new: [
    { key: 'full_name',    label_en: 'Full name (English)', label_ar: 'الاسم الكامل (إنجليزي)', type: 'text',   default_visibility: 'required', is_system_required: true  },
    { key: 'full_name_ar', label_en: 'Full name (Arabic)',  label_ar: 'الاسم الكامل (عربي)',    type: 'text',   default_visibility: 'optional', is_system_required: false },
    { key: 'email',        label_en: 'Email',               label_ar: 'البريد الإلكتروني',      type: 'text',   default_visibility: 'required', is_system_required: true  },
    { key: 'role',         label_en: 'Role',                label_ar: 'الدور',                  type: 'select', default_visibility: 'required', is_system_required: true  },
    { key: 'phone',        label_en: 'Phone',               label_ar: 'الهاتف',                 type: 'text',   default_visibility: 'optional', is_system_required: false },
  ],
  users_edit: [
    { key: 'full_name',    label_en: 'Full name (English)', label_ar: 'الاسم الكامل (إنجليزي)', type: 'text',     default_visibility: 'required', is_system_required: true  },
    { key: 'full_name_ar', label_en: 'Full name (Arabic)',  label_ar: 'الاسم الكامل (عربي)',    type: 'text',     default_visibility: 'optional', is_system_required: false },
    { key: 'role',         label_en: 'Role',                label_ar: 'الدور',                  type: 'select',   default_visibility: 'required', is_system_required: true  },
    { key: 'is_active',    label_en: 'User is active',      label_ar: 'المستخدم نشط',           type: 'checkbox', default_visibility: 'optional', is_system_required: false },
  ],
}

export function isSystemRequired(page: FieldPage, key: string): boolean {
  return FIELD_CATALOG[page].find(f => f.key === key)?.is_system_required ?? false
}

export function getFieldMeta(page: FieldPage, key: string): FieldMeta | undefined {
  return FIELD_CATALOG[page].find(f => f.key === key)
}
