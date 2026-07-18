import { expect, test } from '@playwright/test'

test('core tabs render and packet config can create draft schema', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'DAPLink 串口调试台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '协议终端' })).toBeVisible()
  await expect(page.getByRole('button', { name: '展示终端' })).toBeVisible()
  await expect(page.getByRole('button', { name: '专业调试' })).toBeVisible()
  await expect(page.getByRole('button', { name: '数据包配置' })).toBeVisible()
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible()

  await page.getByRole('button', { name: '数据包配置' }).click()
  await page.getByRole('button', { name: '新增数据包' }).first().click()
  await page.getByRole('button', { name: '添加变量' }).first().click()
  await page.getByRole('button', { name: '应用配置' }).click()
  await page.getByRole('button', { name: '协议终端' }).click()
  await expect(page.getByLabel('TX 消息')).toBeVisible()
})

test('professional tab can add a widget', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '专业调试' }).click()
  await page.getByRole('button', { name: '滑动条' }).click()
  await expect(page.locator('.professional-widget')).toHaveCount(1)
})

test('mobile viewport has no horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})
