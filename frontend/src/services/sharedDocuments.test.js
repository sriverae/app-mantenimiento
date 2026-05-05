import {
  loadSharedDocument,
  saveSharedDocument,
  SHARED_DOCUMENT_CONFLICT_EVENT,
} from './sharedDocuments';
import { getSharedDocument, putSharedDocument } from './api';

jest.mock('./api', () => ({
  getSharedDocument: jest.fn(),
  putSharedDocument: jest.fn(),
}));

describe('sharedDocuments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads the current version before saving a document', async () => {
    const key = 'test_doc_save_version';
    getSharedDocument.mockResolvedValueOnce({ data: [], version: 'v1' });
    putSharedDocument.mockResolvedValueOnce({ data: ['saved'], version: 'v2' });

    await expect(saveSharedDocument(key, ['saved'])).resolves.toEqual(['saved']);

    expect(getSharedDocument).toHaveBeenCalledWith(key);
    expect(putSharedDocument).toHaveBeenCalledWith(key, ['saved'], 'v1');
  });

  test('marks a document as conflicted after a stale save', async () => {
    const key = 'test_doc_conflict';
    const events = [];
    const onConflict = (event) => events.push(event.detail);
    window.addEventListener(SHARED_DOCUMENT_CONFLICT_EVENT, onConflict);

    getSharedDocument.mockResolvedValueOnce({ data: [], version: 'server-v1' });
    putSharedDocument.mockRejectedValueOnce({
      response: { status: 409, data: { detail: 'stale document' } },
    });

    await expect(saveSharedDocument(key, ['local'])).rejects.toMatchObject({
      isSharedDocumentConflict: true,
      key,
    });
    expect(events[0]).toMatchObject({ key, status: 409 });

    putSharedDocument.mockClear();
    await expect(saveSharedDocument(key, ['second try'])).rejects.toMatchObject({
      isSharedDocumentConflict: true,
      key,
    });
    expect(putSharedDocument).not.toHaveBeenCalled();

    window.removeEventListener(SHARED_DOCUMENT_CONFLICT_EVENT, onConflict);
  });

  test('a fresh load clears a previous conflict', async () => {
    const key = 'test_doc_conflict_reload';
    getSharedDocument.mockResolvedValueOnce({ data: [], version: 'server-v1' });
    putSharedDocument.mockRejectedValueOnce({
      response: { status: 409, data: { detail: 'stale document' } },
    });

    await expect(saveSharedDocument(key, ['local'])).rejects.toMatchObject({
      isSharedDocumentConflict: true,
    });

    getSharedDocument.mockResolvedValueOnce({ data: ['server'], version: 'server-v2' });
    await expect(loadSharedDocument(key, [])).resolves.toEqual(['server']);

    putSharedDocument.mockResolvedValueOnce({ data: ['resolved'], version: 'server-v3' });
    await expect(saveSharedDocument(key, ['resolved'])).resolves.toEqual(['resolved']);
    expect(putSharedDocument).toHaveBeenLastCalledWith(key, ['resolved'], 'server-v2');
  });
});
