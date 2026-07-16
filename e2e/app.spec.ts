import { expect, test } from '@playwright/test'

test('core tabs render and configuration can create a custom tab', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'DAPLink 参数调试台' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PID调试' })).toBeVisible()
  await page.getByRole('button', { name: '协议终端' }).click()
  await expect(page.getByRole('heading', { name: '接收与解析' })).toBeVisible()
  await page.getByRole('button', { name: '配置' }).click()
  await page.getByRole('button', { name: '新建Tab' }).click()
  await expect(page.getByRole('button', { name: '自定义 1' })).toBeVisible()
})

test('mobile viewport has no horizontal document overflow', async ({ page }) => {
  await page.goto('./')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})
