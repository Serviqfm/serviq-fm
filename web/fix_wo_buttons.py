import re

files_and_fixes = {
    'src/app/dashboard/work-orders/page.tsx': [
        ('+ New Work Order', "{t('btn.new_wo')}"),
        ('All Technicians', "{t('filter.all_techs')}"),
        ('All Categories', "{t('filter.all_cats')}"),
        ('>Closed<', ">{t('wo.status.closed')}<"),
        ('>Completed<', ">{t('wo.status.completed')}<"),
        ('>On Hold<', ">{t('wo.status.on_hold')}<"),
        ('>In Progress<', ">{t('wo.status.in_progress')}<"),
        ('>Assigned<', ">{t('wo.status.assigned')}<"),
        ('>New<', ">{t('wo.status.new')}<"),
        ('>All<', ">{t('common.all')}<"),
        ('>Critical<', ">{t('wo.priority.critical')}<"),
        ('>High<', ">{t('wo.priority.high')}<"),
        ('>Medium<', ">{t('wo.priority.medium')}<"),
        ('>Low<', ">{t('wo.priority.low')}<"),
        ('>All Priorities<', ">{t('filter.all_priorities')}<"),
        ('Delete Selected', "{t('btn.delete_selected')}"),
        ('Bulk Assign', "{t('btn.bulk_assign')}"),
        ('>View<', ">{t('common.view')}<"),
        ('>Edit<', ">{t('common.edit')}<"),
        ('>Delete<', ">{t('common.delete')}<"),
    ],
    'src/app/dashboard/assets/page.tsx': [
        ('+ Add Asset', "{t('btn.add_asset')}"),
        ('Import CSV', "{t('btn.import')}"),
        ('>Export<', ">{t('btn.export')}<"),
        ('Delete Selected', "{t('btn.delete_selected')}"),
        ('>Edit<', ">{t('common.edit')}<"),
        ('>Delete<', ">{t('common.delete')}<"),
        ('>Active<', ">{t('assets.status.active')}<"),
        ('>Under Maintenance<', ">{t('assets.status.under_maintenance')}<"),
        ('>Retired<', ">{t('assets.status.retired')}<"),
        ('>All Status<', ">{t('common.all')}<"),
        ('All Categories', "{t('filter.all_cats')}"),
    ],
    'src/app/dashboard/pm-schedules/page.tsx': [
        ('+ New Schedule', "{t('btn.add_schedule')}"),
        ('Calendar', "{t('pm.calendar')}"),
        ('Compliance', "{t('pm.compliance')}"),
        ('Delete Selected', "{t('btn.delete_selected')}"),
        ('>Edit<', ">{t('common.edit')}<"),
        ('>Delete<', ">{t('common.delete')}<"),
        ('>Pause<', ">{t('pm.pause')}<"),
        ('>Resume<', ">{t('pm.resume')}<"),
        ('Generate WO', "{t('pm.generate')}"),
    ],
    'src/app/dashboard/inspections/page.tsx': [
        ('+ New Template', "{t('btn.new_template')}"),
        ('+ Start Inspection', "{t('btn.start_inspection')}"),
        ('Delete Selected', "{t('btn.delete_selected')}"),
        ('>View<', ">{t('common.view')}<"),
        ('>Delete<', ">{t('common.delete')}<"),
        ('>Edit<', ">{t('common.edit')}<"),
        ('Use Template', "{t('btn.start_inspection')}"),
    ],
    'src/app/dashboard/inventory/page.tsx': [
        ('+ Add Item', "{t('btn.add_item')}"),
        ('Delete Selected', "{t('btn.delete_selected')}"),
        ('>Edit<', ">{t('common.edit')}<"),
        ('>Delete<', ">{t('common.delete')}<"),
    ],
    'src/app/dashboard/vendors/page.tsx': [
        ('+ Add Vendor', "{t('btn.add_vendor')}"),
        ('Delete Selected', "{t('btn.delete_selected')}"),
        ('>View<', ">{t('common.view')}<"),
        ('>Edit<', ">{t('common.edit')}<"),
        ('>Delete<', ">{t('common.delete')}<"),
    ],
    'src/app/dashboard/users/page.tsx': [
        ('+ Add User', "{t('btn.add_user')}"),
        ('>Edit<', ">{t('common.edit')}<"),
    ],
}

for filepath, replacements in files_and_fixes.items():
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        count = 0
        for old_text, new_text in replacements:
            # Replace JSX text content (between > and <)
            old_jsx = '>' + old_text + '<'
            new_jsx = new_text if new_text.startswith('>') else '>' + new_text + '<'
            if old_jsx in content:
                content = content.replace(old_jsx, new_jsx)
                count += 1
                continue
            
            # Replace plain text in JSX (not wrapped in > <)
            if old_text in content and new_text not in content:
                content = content.replace(old_text, new_text)
                count += 1

        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'OK ({count} fixes): {filepath}')
        else:
            print(f'NO CHANGES: {filepath}')

    except FileNotFoundError:
        print(f'NOT FOUND: {filepath}')
    except Exception as e:
        print(f'ERROR {filepath}: {e}')

print('Done')