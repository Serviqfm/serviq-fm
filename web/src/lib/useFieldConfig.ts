// web/src/lib/useFieldConfig.ts
'use client'

import { useEffect, useState } from 'react'
import { FieldPage, FieldVisibility } from './field-catalog'

export function useFieldConfig(page: FieldPage) {
  const [config, setConfig] = useState<Map<string, FieldVisibility> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/field-configs?page=${encodeURIComponent(page)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.config) {
          setConfig(new Map(Object.entries(data.config) as [string, FieldVisibility][]))
        } else {
          setConfig(new Map())
        }
      })
      .catch(() => {
        if (!cancelled) setConfig(new Map())
      })
    return () => { cancelled = true }
  }, [page])

  return {
    config,
    loading: config === null,
    isHidden: (key: string) => config?.get(key) === 'hidden',
    isRequired: (key: string) => config?.get(key) === 'required',
    isOptional: (key: string) => config?.get(key) === 'optional',
  }
}
