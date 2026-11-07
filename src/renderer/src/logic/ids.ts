/** ID 生成：优先使用 crypto.randomUUID，测试环境下退回随机字符串。 */

let counter = 0

export function newId(prefix = 'b'): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } }
  if (g.crypto?.randomUUID) {
    try {
      return `${prefix}_${g.crypto.randomUUID()}`
    } catch {
      /* fallthrough */
    }
  }
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random().toString(36).slice(2, 8)}`
}
