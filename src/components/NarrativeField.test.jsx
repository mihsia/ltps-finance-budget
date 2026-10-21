import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import NarrativeField from './NarrativeField';

function render(props) {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(<NarrativeField label="財務概況" color="#B5533E" {...props} />);
  });
  return renderer;
}

function findByText(renderer, text) {
  return renderer.root.findAll((node) => typeof node.type === 'string' && (node.children || []).join('') === text);
}

function pageText(renderer) {
  return renderer.root.findAll((node) => typeof node.type === 'string').map((n) => (n.children || []).join('')).join('');
}

describe('NarrativeField read-only display', () => {
  it('shows the auto-generated default text and a "系統自動產生" badge when there is no saved override', () => {
    const renderer = render({ defaultText: '115年度歲出預算為 1,000 千元。', savedText: null, canEdit: false });
    expect(pageText(renderer)).toContain('115年度歲出預算為 1,000 千元。');
    expect(findByText(renderer, '系統自動產生')).toHaveLength(1);
    expect(renderer.root.findAllByType('button')).toHaveLength(0);
  });

  it('shows the saved override instead of the default, with an "已自訂" badge', () => {
    const renderer = render({ defaultText: '自動產生的草稿。', savedText: '管理者改過的文字。', canEdit: false });
    expect(pageText(renderer)).toContain('管理者改過的文字。');
    expect(pageText(renderer)).not.toContain('自動產生的草稿。');
    expect(findByText(renderer, '已自訂')).toHaveLength(1);
  });

  it('hides the 編輯 button for a non-admin viewer', () => {
    const renderer = render({ defaultText: '文字。', savedText: null, canEdit: false });
    expect(findByText(renderer, '編輯')).toHaveLength(0);
  });
});

describe('NarrativeField editing (admin)', () => {
  it('opens a textarea pre-filled with the current effective text', async () => {
    const renderer = render({ defaultText: '自動產生的草稿。', savedText: null, canEdit: true });
    await act(async () => findByText(renderer, '編輯')[0].props.onClick());
    const textarea = renderer.root.findByType('textarea');
    expect(textarea.props.value).toBe('自動產生的草稿。');
  });

  it('calls onSave with the edited text and exits editing on success', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const renderer = render({ defaultText: '原始文字。', savedText: null, canEdit: true, onSave });
    await act(async () => findByText(renderer, '編輯')[0].props.onClick());
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: '改過的文字。' } }));
    await act(async () => findByText(renderer, '儲存')[0].props.onClick());

    expect(onSave).toHaveBeenCalledWith('改過的文字。');
    expect(renderer.root.findAllByType('textarea')).toHaveLength(0);
  });

  it('shows the failure reason and stays in editing mode when onSave fails', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, reason: '僅限管理者編輯。' });
    const renderer = render({ defaultText: '原始文字。', savedText: null, canEdit: true, onSave });
    await act(async () => findByText(renderer, '編輯')[0].props.onClick());
    await act(async () => findByText(renderer, '儲存')[0].props.onClick());

    expect(pageText(renderer)).toContain('僅限管理者編輯。');
    expect(renderer.root.findAllByType('textarea')).toHaveLength(1);
  });

  it('discards edits without calling onSave when 取消 is clicked', async () => {
    const onSave = vi.fn();
    const renderer = render({ defaultText: '原始文字。', savedText: null, canEdit: true, onSave });
    await act(async () => findByText(renderer, '編輯')[0].props.onClick());
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: '不要存的文字。' } }));
    await act(async () => findByText(renderer, '取消')[0].props.onClick());

    expect(onSave).not.toHaveBeenCalled();
    expect(pageText(renderer)).toContain('原始文字。');
  });

  it('only offers "還原為自動產生" when a saved override exists, and calls onReset', async () => {
    const onReset = vi.fn().mockResolvedValue({ ok: true });
    const renderer = render({ defaultText: '草稿。', savedText: '自訂的文字。', canEdit: true, onReset });
    await act(async () => findByText(renderer, '編輯')[0].props.onClick());
    expect(findByText(renderer, '還原為自動產生')).toHaveLength(1);

    await act(async () => findByText(renderer, '還原為自動產生')[0].props.onClick());
    expect(onReset).toHaveBeenCalled();
    expect(renderer.root.findAllByType('textarea')).toHaveLength(0);
  });

  it('does not offer "還原為自動產生" when there is no saved override yet', async () => {
    const renderer = render({ defaultText: '草稿。', savedText: null, canEdit: true });
    await act(async () => findByText(renderer, '編輯')[0].props.onClick());
    expect(findByText(renderer, '還原為自動產生')).toHaveLength(0);
  });
});
