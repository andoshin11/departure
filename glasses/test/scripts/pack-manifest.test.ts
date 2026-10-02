import { describe, expect, it } from 'vite-plus/test'
import { buildPackManifest, productionOrigin } from '../../scripts/pack-manifest'

const appJson = {
  package_id: 'com.example.app',
  permissions: [
    { name: 'location', desc: '現在地' },
    { name: 'network', desc: '通信', whitelist: ['http://localhost:3000'] },
  ],
}

describe('productionOrigin', () => {
  it('base URL から origin を取り出す（パスは捨てる）', () => {
    expect(productionOrigin('https://api.example.com/v1/')).toBe('https://api.example.com')
  })

  it('https 以外・URL でない値は例外', () => {
    expect(() => productionOrigin('http://localhost:3000')).toThrow('https')
    expect(() => productionOrigin('not a url')).toThrow('URL')
  })
})

describe('buildPackManifest', () => {
  it('network の whitelist を本番の origin だけに置き換え、localhost を外す', () => {
    const m = buildPackManifest(appJson, 'https://api.example.com')
    expect(m.permissions).toEqual([
      { name: 'location', desc: '現在地' },
      { name: 'network', desc: '通信', whitelist: ['https://api.example.com'] },
    ])
  })

  it('他のフィールドはそのまま残し、元の app.json は書き換えない', () => {
    const m = buildPackManifest(appJson, 'https://api.example.com')
    expect(m.package_id).toBe('com.example.app')
    expect(appJson.permissions[1]!.whitelist).toEqual(['http://localhost:3000'])
  })

  it('network 権限が無い app.json は例外', () => {
    expect(() => buildPackManifest({ permissions: [{ name: 'location', desc: 'x' }] }, 'https://api.example.com')).toThrow('network')
  })
})
