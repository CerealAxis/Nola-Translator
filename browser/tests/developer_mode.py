"""Enable developer mode through Chrome's real extension-manager UI in disposable profiles."""

def enable_developer_mode(context):
    page=context.new_page()
    try:
        page.goto('chrome://extensions')
        toggle=page.locator('#devMode')
        toggle.wait_for()
        if toggle.get_attribute('checked') is None:toggle.click()
        page.locator('#devMode[checked]').wait_for(state='attached')
    finally:page.close()
