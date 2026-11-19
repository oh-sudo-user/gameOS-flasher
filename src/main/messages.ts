import { translate, type MessageKey, type TranslateParams } from '../shared/i18n'
import { currentLocale } from './settings'

/** 主进程内的本地化快捷方法 */
export function mt(key: MessageKey, params?: TranslateParams): string {
  return translate(currentLocale(), key, params)
}
