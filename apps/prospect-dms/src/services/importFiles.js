// CSV helpers shared by the import wizard and Import History.
export const IMPORT_HEAD = ['first name', 'middle name', 'last name', 'mobile', 'email', 'city', 'state', 'pan']

export function downloadCsv(name, csv) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
  a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
