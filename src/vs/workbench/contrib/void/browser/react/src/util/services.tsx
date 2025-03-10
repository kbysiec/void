/*------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for more information.
 *-----------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react'
import { ThreadsState } from '../../../threadHistoryService.js'
import { RefreshableProviderName, SettingsOfProvider } from '../../../../../../../platform/void/common/voidSettingsTypes.js'
import { IDisposable } from '../../../../../../../base/common/lifecycle.js'
import { VoidSidebarState } from '../../../sidebarStateService.js'
import { VoidSettingsState } from '../../../../../../../platform/void/common/voidSettingsService.js'
import { ColorScheme } from '../../../../../../../platform/theme/common/theme.js'
import { VoidQuickEditState } from '../../../quickEditStateService.js'
import { RefreshModelStateOfProvider } from '../../../../../../../platform/void/common/refreshModelService.js'





import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IClipboardService } from '../../../../../../../platform/clipboard/common/clipboardService.js';
import { IContextViewService, IContextMenuService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { ILLMMessageService } from '../../../../../../../platform/void/common/llmMessageService.js';
import { IRefreshModelService } from '../../../../../../../platform/void/common/refreshModelService.js';
import { IVoidSettingsService } from '../../../../../../../platform/void/common/voidSettingsService.js';
import { IInlineDiffsService } from '../../../inlineDiffsService.js';
import { IQuickEditStateService } from '../../../quickEditStateService.js';
import { ISidebarStateService } from '../../../sidebarStateService.js';
import { IThreadHistoryService } from '../../../threadHistoryService.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js'
import { ICodeEditorService } from '../../../../../../../editor/browser/services/codeEditorService.js'
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js'
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js'
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js'
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js'
import { ILanguageConfigurationService } from '../../../../../../../editor/common/languages/languageConfigurationRegistry.js'
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js'
import { ILanguageDetectionService } from '../../../../../../services/languageDetection/common/languageDetectionWorkerService.js'



// normally to do this you'd use a useEffect that calls .onDidChangeState(), but useEffect mounts too late and misses initial state changes

// even if React hasn't mounted yet, the variables are always updated to the latest state.
// React listens by adding a setState function to these listeners.
let quickEditState: VoidQuickEditState
const quickEditStateListeners: Set<(s: VoidQuickEditState) => void> = new Set()

let sidebarState: VoidSidebarState
const sidebarStateListeners: Set<(s: VoidSidebarState) => void> = new Set()

let threadsState: ThreadsState
const threadsStateListeners: Set<(s: ThreadsState) => void> = new Set()

let settingsState: VoidSettingsState
const settingsStateListeners: Set<(s: VoidSettingsState) => void> = new Set()

let refreshModelState: RefreshModelStateOfProvider
const refreshModelStateListeners: Set<(s: RefreshModelStateOfProvider) => void> = new Set()
const refreshModelProviderListeners: Set<(p: RefreshableProviderName, s: RefreshModelStateOfProvider) => void> = new Set()

let colorThemeState: ColorScheme
const colorThemeStateListeners: Set<(s: ColorScheme) => void> = new Set()

// must call this before you can use any of the hooks below
// this should only be called ONCE! this is the only place you don't need to dispose onDidChange. If you use state.onDidChange anywhere else, make sure to dispose it!
let wasCalled = false
export const _registerServices = (accessor: ServicesAccessor) => {

	const disposables: IDisposable[] = []

	// don't register services twice
	if (wasCalled) {
		return
		// console.error(`⚠️ Void _registerServices was called again! It should only be called once.`)
	}
	wasCalled = true

	_registerAccessor(accessor)

	const stateServices = {
		quickEditStateService: accessor.get(IQuickEditStateService),
		sidebarStateService: accessor.get(ISidebarStateService),
		threadsStateService: accessor.get(IThreadHistoryService),
		settingsStateService: accessor.get(IVoidSettingsService),
		refreshModelService: accessor.get(IRefreshModelService),
		themeService: accessor.get(IThemeService),
	}

	const { sidebarStateService, quickEditStateService, settingsStateService, threadsStateService, refreshModelService, themeService, } = stateServices

	quickEditState = quickEditStateService.state
	disposables.push(
		quickEditStateService.onDidChangeState(() => {
			quickEditState = quickEditStateService.state
			quickEditStateListeners.forEach(l => l(quickEditState))
		})
	)

	sidebarState = sidebarStateService.state
	disposables.push(
		sidebarStateService.onDidChangeState(() => {
			sidebarState = sidebarStateService.state
			sidebarStateListeners.forEach(l => l(sidebarState))
		})
	)

	threadsState = threadsStateService.state
	disposables.push(
		threadsStateService.onDidChangeCurrentThread(() => {
			threadsState = threadsStateService.state
			threadsStateListeners.forEach(l => l(threadsState))
		})
	)

	settingsState = settingsStateService.state
	disposables.push(
		settingsStateService.onDidChangeState(() => {
			settingsState = settingsStateService.state
			settingsStateListeners.forEach(l => l(settingsState))
		})
	)

	refreshModelState = refreshModelService.state
	disposables.push(
		refreshModelService.onDidChangeState((providerName) => {
			refreshModelState = refreshModelService.state
			refreshModelStateListeners.forEach(l => l(refreshModelState))
			refreshModelProviderListeners.forEach(l => l(providerName, refreshModelState))
		})
	)

	colorThemeState = themeService.getColorTheme().type
	disposables.push(
		themeService.onDidColorThemeChange(theme => {
			colorThemeState = theme.type
			colorThemeStateListeners.forEach(l => l(colorThemeState))
		})
	)

	return disposables
}



const getReactAccessor = (accessor: ServicesAccessor) => {
	const reactAccessor = {
		IModelService: accessor.get(IModelService),
		IClipboardService: accessor.get(IClipboardService),
		IContextViewService: accessor.get(IContextViewService),
		IContextMenuService: accessor.get(IContextMenuService),
		IFileService: accessor.get(IFileService),
		IHoverService: accessor.get(IHoverService),
		IThemeService: accessor.get(IThemeService),
		ILLMMessageService: accessor.get(ILLMMessageService),
		IRefreshModelService: accessor.get(IRefreshModelService),
		IVoidSettingsService: accessor.get(IVoidSettingsService),
		IInlineDiffsService: accessor.get(IInlineDiffsService),
		IQuickEditStateService: accessor.get(IQuickEditStateService),
		ISidebarStateService: accessor.get(ISidebarStateService),
		IThreadHistoryService: accessor.get(IThreadHistoryService),

		IInstantiationService: accessor.get(IInstantiationService),
		ICodeEditorService: accessor.get(ICodeEditorService),
		ICommandService: accessor.get(ICommandService),
		IContextKeyService: accessor.get(IContextKeyService),
		INotificationService: accessor.get(INotificationService),
		IAccessibilityService: accessor.get(IAccessibilityService),
		ILanguageConfigurationService: accessor.get(ILanguageConfigurationService),
		ILanguageDetectionService: accessor.get(ILanguageDetectionService),
		ILanguageFeaturesService: accessor.get(ILanguageFeaturesService),

	} as const
	return reactAccessor
}

type ReactAccessor = ReturnType<typeof getReactAccessor>


let reactAccessor_: ReactAccessor | null = null
const _registerAccessor = (accessor: ServicesAccessor) => {
	const reactAccessor = getReactAccessor(accessor)
	reactAccessor_ = reactAccessor
}

// -- services --
export const useAccessor = () => {
	if (!reactAccessor_) {
		throw new Error(`⚠️ Void useAccessor was called before _registerServices!`)
	}

	return { get: <S extends keyof ReactAccessor,>(service: S): ReactAccessor[S] => reactAccessor_![service] }
}



// -- state of services --

export const useQuickEditState = () => {
	const [s, ss] = useState(quickEditState)
	useEffect(() => {
		ss(quickEditState)
		quickEditStateListeners.add(ss)
		return () => { quickEditStateListeners.delete(ss) }
	}, [ss])
	return s
}

export const useSidebarState = () => {
	const [s, ss] = useState(sidebarState)
	useEffect(() => {
		ss(sidebarState)
		sidebarStateListeners.add(ss)
		return () => { sidebarStateListeners.delete(ss) }
	}, [ss])
	return s
}

export const useSettingsState = () => {
	const [s, ss] = useState(settingsState)
	useEffect(() => {
		ss(settingsState)
		settingsStateListeners.add(ss)
		return () => { settingsStateListeners.delete(ss) }
	}, [ss])
	return s
}

export const useThreadsState = () => {
	const [s, ss] = useState(threadsState)
	useEffect(() => {
		ss(threadsState)
		threadsStateListeners.add(ss)
		return () => { threadsStateListeners.delete(ss) }
	}, [ss])
	return s
}


export const useRefreshModelState = () => {
	const [s, ss] = useState(refreshModelState)
	useEffect(() => {
		ss(refreshModelState)
		refreshModelStateListeners.add(ss)
		return () => { refreshModelStateListeners.delete(ss) }
	}, [ss])
	return s
}


export const useRefreshModelListener = (listener: (providerName: RefreshableProviderName, s: RefreshModelStateOfProvider) => void) => {
	useEffect(() => {
		refreshModelProviderListeners.add(listener)
		return () => { refreshModelProviderListeners.delete(listener) }
	}, [listener])
}


export const useIsDark = () => {
	const [s, ss] = useState(colorThemeState)
	useEffect(() => {
		ss(colorThemeState)
		colorThemeStateListeners.add(ss)
		return () => { colorThemeStateListeners.delete(ss) }
	}, [ss])

	// s is the theme, return isDark instead of s
	const isDark = s === ColorScheme.DARK || s === ColorScheme.HIGH_CONTRAST_DARK
	return isDark

}
