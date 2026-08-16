/**
 * Мост между аккаунтом на сервере и локальным профилем.
 *
 * Локальный профиль получает тот же идентификатор, что и запись на сервере.
 * Это важнее, чем кажется: все строки в базе ссылаются на user_id, и если
 * при входе с нового телефона завести профиль со свежим uuid, приехавшие
 * тренировки окажутся привязаны к чужому идентификатору и не покажутся.
 */

import { APP_STATE_ID, db, now, setActiveUser, type Role, type UserProfile } from './db'
import { authUser, isAuthed, type AuthUser } from '../lib/backend'
import { initialPull, push, startSync, syncClients } from './sync'

const roleOf = (user: AuthUser): Role => (user.role === 'trainer' ? 'TRAINER' : 'CLIENT')

/**
 * Готовит локальный профиль под вошедшего человека и делает его активным.
 * Возвращает признак того, что профиль появился только что — по нему
 * решается, нужна ли первая полная загрузка с сервера.
 */
export async function adoptAccount(user: AuthUser): Promise<{ fresh: boolean }> {
  const existing = await db.profile.get(user.id)
  const role = roleOf(user)

  if (!existing) {
    const profile: UserProfile = {
      id: user.id,
      name: user.name?.trim() || (role === 'TRAINER' ? 'Тренер' : 'Клиент'),
      role,
      plan: 'FREE',
      default_rest_seconds: 90,
      haptics_enabled: 1,
      sound_enabled: 1,
      updated_at: now(),
    }
    await db.profile.add(profile)
    await setActiveUser(user.id)
    return { fresh: true }
  }

  // Имя и роль ведёт сервер: их могли поменять с другого устройства.
  if (existing.name !== user.name || existing.role !== role) {
    await db.profile.update(user.id, {
      name: user.name?.trim() || existing.name,
      role,
    })
  }
  await setActiveUser(user.id)
  return { fresh: false }
}

/**
 * Полный обмен сразу после входа.
 *
 * Человек, зашедший на новом устройстве, должен увидеть свои тренировки
 * немедленно, а не через полминуты; а тот, кто пользовался приложением до
 * регистрации, — не потерять накопленное. Поэтому здесь и загрузка, и
 * отправка, а не только одна из них.
 */
export async function firstExchange(
  _user: AuthUser,
  fresh: boolean,
  justRegistered = false,
): Promise<void> {
  await syncClients().catch(() => 0)

  if (fresh) await initialPull()
  await push().catch(() => 0)

  // Онбординг — знакомство с приложением, а не настройка устройства.
  // Тот, кто входит в существующий аккаунт, уже знаком: показывать ему
  // приветствие на каждом новом телефоне значит не помнить его.
  if (justRegistered) return
  const state = await db.appState.get(APP_STATE_ID)
  if (state && !state.onboarded) {
    await db.appState.put({ ...state, onboarded: 1 })
  }
}

/**
 * Поднимает сессию при старте приложения. Вызывается до первого рендера,
 * чтобы экраны сразу открылись от имени нужного аккаунта.
 */
export async function restoreSession(): Promise<boolean> {
  if (!isAuthed()) return false
  const user = authUser()
  if (!user) return false

  await adoptAccount(user)
  // Обмен принципиально не ждём: сеть может быть медленной или мёртвой, а
  // приложение офлайн-первое и обязано открыться на локальных данных.
  startSync()
  return true
}
