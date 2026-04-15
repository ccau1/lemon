import { test, expect } from '@playwright/test'

test('workspaces page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible()
})
