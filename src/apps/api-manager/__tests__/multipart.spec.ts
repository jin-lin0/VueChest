import { describe, expect, it, vi } from 'vitest'
import { parseCurlCommand } from '../curl-importer'
import { prepareRequestBody } from '../request-body'
import { runSavedRequest } from '../request-executor'
import { createSavedRequestFromApi } from '../saved-request'
import { buildCurlCommand } from '../request-utils'
import { importApiDocument } from '../importers'
import type { ApiItem } from '../defaults'

const api: ApiItem = {
  id: 'upload',
  name: '上传',
  method: 'POST',
  url: 'https://example.com',
  category: '',
  description: '',
  params: [],
}
describe('request body consistency', () => {
  it('cURL → serialized request → collection run uses actual FormData and browser boundary', async () => {
    const parsed = parseCurlCommand(
      `curl https://example.com -H 'Content-Type: multipart/form-data; boundary=stale' -F 'tag={{tag}}' -F 'tag=second' -F 'upload=@demo.txt;filename=sent.txt;type=text/plain'`,
    )
    const saved = JSON.parse(
      JSON.stringify({
        ...createSavedRequestFromApi(api, 'one'),
        body: '',
        bodyMode: parsed.bodyMode,
        formFields: parsed.formFields,
        headers: parsed.headers.map((h) => ({ ...h, id: h.name, enabled: true })),
      }),
    )
    const file = new File(['real bytes'], 'demo.txt', { type: 'text/plain' })
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toEqual({})
      const form = init.body as FormData
      expect(form.getAll('tag')).toEqual(['first', 'second'])
      const upload = form.get('upload') as File
      expect(upload.name).toBe('sent.txt')
      expect(await upload.text()).toBe('real bytes')
      return new Response('{}')
    })
    const result = await runSavedRequest(
      saved,
      api,
      [{ id: 'v', key: 'tag', value: 'first', enabled: true }],
      { fetch: fetchMock as typeof fetch, files: { [saved.formFields[2].id]: file } },
    )
    expect(result.result.ok).toBe(true)
    expect(result.result.request.body).toContain('[文件 sent.txt · 10 B]')
    const reloaded = await runSavedRequest(saved, api, [], { fetch: fetchMock as typeof fetch })
    expect(reloaded.result.error).toContain('请重新选择文件')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('GET/HEAD never send a body; DELETE/OPTIONS retain theirs, including copied cURL', () => {
    for (const method of ['GET', 'HEAD'] as const) {
      expect(
        prepareRequestBody({
          method,
          body: '{"x":1}',
          bodyMode: 'form-data',
          formFields: [{ id: 'missing', name: 'f', type: 'file', value: 'x', enabled: true }],
        }).body,
      ).toBeUndefined()
      expect(buildCurlCommand({ ...api, method }, api.url, [], 'body')).not.toContain('--data')
    }
    for (const method of ['DELETE', 'OPTIONS'] as const) {
      expect(prepareRequestBody({ method, body: 'body' }).body).toBe('body')
      expect(buildCurlCommand({ ...api, method }, api.url, [], 'body')).toContain('--data-raw')
    }
  })

  it('round-trips literal form values and file metadata through cURL', () => {
    const parsed = parseCurlCommand(
      `curl https://example.com --form-string 'name=@literal;type=x' -F 'photo=@a b.png;filename=cover.png;type=image/png'`,
    )
    const copy = buildCurlCommand(api, api.url, [], '', 'form-data', parsed.formFields)
    const again = parseCurlCommand(copy)
    expect(again.formFields?.map((field) => ({ ...field, id: '' }))).toEqual(
      parsed.formFields?.map((field) => ({ ...field, id: '' })),
    )
  })

  it('imports HEAD/OPTIONS and Postman formdata without dropping disabled fields', () => {
    const result = importApiDocument(
      JSON.stringify({
        info: { _postman_id: 'local' },
        item: [
          { name: 'Head', request: { method: 'HEAD', url: api.url } },
          { name: 'Options', request: { method: 'OPTIONS', url: api.url } },
          {
            name: 'Upload',
            request: {
              method: 'POST',
              url: api.url,
              body: {
                mode: 'formdata',
                formdata: [
                  { key: 'upload', type: 'file', src: ['a.txt', 'b.txt'] },
                  { key: 'skip', value: '1', disabled: true },
                ],
              },
            },
          },
        ],
      }),
    )
    expect(result.requests.map((request) => request.api.method)).toEqual([
      'HEAD',
      'OPTIONS',
      'POST',
    ])
    expect(result.requests[2].formFields).toHaveLength(3)
    expect(result.requests[2].formFields?.[2].enabled).toBe(false)
  })

  it('round-trips quoted filenames containing commas, semicolons, quotes and backslashes', () => {
    const field = {
      id: 'file',
      name: 'upload',
      enabled: true,
      type: 'file' as const,
      value: '目录\\报告;第1,2版"草稿".txt',
      filename: '发送;版本"一".txt',
      contentType: 'text/plain',
    }
    const command = buildCurlCommand(api, api.url, [], '', 'form-data', [field])
    const parsed = parseCurlCommand(command)
    expect(parsed.formFields?.[0]).toMatchObject({ ...field, id: expect.any(String) })
  })
})
