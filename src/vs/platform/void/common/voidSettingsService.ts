/*------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for more information.
 *-----------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { deepClone } from '../../../base/common/objects.js';
import { IEncryptionService } from '../../encryption/common/encryptionService.js';
import { registerSingleton, InstantiationType } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { defaultSettingsOfProvider, FeatureName, ProviderName, ModelSelectionOfFeature, SettingsOfProvider, SettingName, providerNames, ModelSelection, modelSelectionsEqual, featureNames, modelInfoOfDefaultNames, VoidModelInfo, FeatureFlagSettings, FeatureFlagName, defaultFeatureFlagSettings } from './voidSettingsTypes.js';


const STORAGE_KEY = 'void.voidSettingsStorage'

type SetSettingOfProviderFn = <S extends SettingName>(
	providerName: ProviderName,
	settingName: S,
	newVal: SettingsOfProvider[ProviderName][S extends keyof SettingsOfProvider[ProviderName] ? S : never],
) => Promise<void>;

type SetModelSelectionOfFeatureFn = <K extends FeatureName>(
	featureName: K,
	newVal: ModelSelectionOfFeature[K],
	options?: { doNotApplyEffects?: true }
) => Promise<void>;

type SetFeatureFlagFn = (flagName: FeatureFlagName, newVal: boolean) => void;

export type ModelOption = { text: string, value: ModelSelection }



export type VoidSettingsState = {
	readonly settingsOfProvider: SettingsOfProvider; // optionsOfProvider
	readonly modelSelectionOfFeature: ModelSelectionOfFeature; // stateOfFeature
	readonly featureFlagSettings: FeatureFlagSettings;

	readonly _modelOptions: ModelOption[] // computed based on the two above items
}

type EventProp = Exclude<keyof VoidSettingsState, '_modelOptions'> | 'all'


export interface IVoidSettingsService {
	readonly _serviceBrand: undefined;
	readonly state: VoidSettingsState; // in order to play nicely with react, you should immutably change state
	readonly waitForInitState: Promise<void>;

	onDidChangeState: Event<EventProp>;

	setSettingOfProvider: SetSettingOfProviderFn;
	setModelSelectionOfFeature: SetModelSelectionOfFeatureFn;
	setFeatureFlag: SetFeatureFlagFn;

	setDefaultModels(providerName: ProviderName, modelNames: string[]): void;
	toggleModelHidden(providerName: ProviderName, modelName: string): void;
	addModel(providerName: ProviderName, modelName: string): void;
	deleteModel(providerName: ProviderName, modelName: string): boolean;
}


let _computeModelOptions = (settingsOfProvider: SettingsOfProvider) => {
	let modelOptions: ModelOption[] = []
	for (const providerName of providerNames) {
		const providerConfig = settingsOfProvider[providerName]
		if (!providerConfig._enabled) continue // if disabled, don't display model options
		for (const { modelName, isHidden } of providerConfig.models) {
			if (isHidden) continue
			modelOptions.push({ text: `${modelName} (${providerName})`, value: { providerName, modelName } })
		}
	}
	return modelOptions
}


const defaultState = () => {
	const d: VoidSettingsState = {
		settingsOfProvider: deepClone(defaultSettingsOfProvider),
		modelSelectionOfFeature: { 'Ctrl+L': null, 'Ctrl+K': null, 'Autocomplete': null },
		featureFlagSettings: deepClone(defaultFeatureFlagSettings),
		_modelOptions: _computeModelOptions(defaultSettingsOfProvider), // computed
	}
	return d
}


export const IVoidSettingsService = createDecorator<IVoidSettingsService>('VoidSettingsService');
class VoidSettingsService extends Disposable implements IVoidSettingsService {
	_serviceBrand: undefined;

	private readonly _onDidChangeState = new Emitter<EventProp>();
	readonly onDidChangeState: Event<EventProp> = this._onDidChangeState.event; // this is primarily for use in react, so react can listen + update on state changes

	state: VoidSettingsState;
	waitForInitState: Promise<void> // await this if you need a valid state initially

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IEncryptionService private readonly _encryptionService: IEncryptionService,
		// could have used this, but it's clearer the way it is (+ slightly different eg StorageTarget.USER)
		// @ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
	) {
		super()

		// at the start, we haven't read the partial config yet, but we need to set state to something
		this.state = defaultState()

		let resolver: () => void = () => { }
		this.waitForInitState = new Promise((res, rej) => resolver = res)

		// read and update the actual state immediately
		this._readState().then(s => {
			this.state = s
			resolver()
			this._onDidChangeState.fire('all')
		})
	}

	private async _readState(): Promise<VoidSettingsState> {
		const encryptedState = this._storageService.get(STORAGE_KEY, StorageScope.APPLICATION)

		if (!encryptedState)
			return defaultState()

		const stateStr = await this._encryptionService.decrypt(encryptedState)
		return JSON.parse(stateStr)
	}


	private async _storeState() {
		const state = this.state
		const encryptedState = await this._encryptionService.encrypt(JSON.stringify(state))
		this._storageService.store(STORAGE_KEY, encryptedState, StorageScope.APPLICATION, StorageTarget.USER);
	}

	setSettingOfProvider: SetSettingOfProviderFn = async (providerName, settingName, newVal) => {

		const newModelSelectionOfFeature = this.state.modelSelectionOfFeature

		const newSettingsOfProvider = {
			...this.state.settingsOfProvider,
			[providerName]: {
				...this.state.settingsOfProvider[providerName],
				[settingName]: newVal,
			}
		}

		const newFeatureFlags = this.state.featureFlagSettings

		// if changed models or enabled a provider, recompute models list
		const modelsListChanged = settingName === 'models' || settingName === '_enabled'
		const newModelsList = modelsListChanged ? _computeModelOptions(newSettingsOfProvider) : this.state._modelOptions

		const newState: VoidSettingsState = {
			modelSelectionOfFeature: newModelSelectionOfFeature,
			settingsOfProvider: newSettingsOfProvider,
			featureFlagSettings: newFeatureFlags,
			_modelOptions: newModelsList,
		}

		// this must go above this.setanythingelse()
		this.state = newState

		// if the user-selected model is no longer in the list, update the selection for each feature that needs it to something relevant (the 0th model available, or null)
		if (modelsListChanged) {
			for (const featureName of featureNames) {

				const currentSelection = newModelSelectionOfFeature[featureName]
				const selnIdx = currentSelection === null ? -1 : newModelsList.findIndex(m => modelSelectionsEqual(m.value, currentSelection))

				if (selnIdx === -1) {
					if (newModelsList.length !== 0)
						this.setModelSelectionOfFeature(featureName, newModelsList[0].value, { doNotApplyEffects: true })
					else
						this.setModelSelectionOfFeature(featureName, null, { doNotApplyEffects: true })
				}
			}
		}

		await this._storeState()
		this._onDidChangeState.fire('settingsOfProvider')
	}


	setFeatureFlag: SetFeatureFlagFn = async (flagName, newVal) => {
		const newState = {
			...this.state,
			featureFlagSettings: {
				...this.state.featureFlagSettings,
				[flagName]: newVal
			}
		}
		this.state = newState
		await this._storeState()
		this._onDidChangeState.fire('featureFlagSettings')

	}


	setModelSelectionOfFeature: SetModelSelectionOfFeatureFn = async (featureName, newVal, options) => {
		const newState: VoidSettingsState = {
			...this.state,
			modelSelectionOfFeature: {
				...this.state.modelSelectionOfFeature,
				[featureName]: newVal
			}
		}

		this.state = newState

		if (options?.doNotApplyEffects)
			return

		await this._storeState()
		this._onDidChangeState.fire('modelSelectionOfFeature')
	}



	setDefaultModels(providerName: ProviderName, newDefaultModelNames: string[]) {
		const { models } = this.state.settingsOfProvider[providerName]
		const newDefaultModels = modelInfoOfDefaultNames(newDefaultModelNames, { isAutodetected: true, existingModels: models })
		const newModels = [
			...newDefaultModels,
			...models.filter(m => !m.isDefault), // keep any non-default models
		]
		this.setSettingOfProvider(providerName, 'models', newModels)
	}
	toggleModelHidden(providerName: ProviderName, modelName: string) {
		const { models } = this.state.settingsOfProvider[providerName]
		const modelIdx = models.findIndex(m => m.modelName === modelName)
		if (modelIdx === -1) return
		const newModels: VoidModelInfo[] = [
			...models.slice(0, modelIdx),
			{ ...models[modelIdx], isHidden: !models[modelIdx].isHidden },
			...models.slice(modelIdx + 1, Infinity)
		]
		this.setSettingOfProvider(providerName, 'models', newModels)
	}
	addModel(providerName: ProviderName, modelName: string) {
		const { models } = this.state.settingsOfProvider[providerName]
		const existingIdx = models.findIndex(m => m.modelName === modelName)
		if (existingIdx !== -1) return // if exists, do nothing
		const newModels = [
			...models,
			{ modelName, isDefault: false, isHidden: false }
		]
		this.setSettingOfProvider(providerName, 'models', newModels)
	}
	deleteModel(providerName: ProviderName, modelName: string): boolean {
		const { models } = this.state.settingsOfProvider[providerName]
		const delIdx = models.findIndex(m => m.modelName === modelName)
		if (delIdx === -1) return false
		const newModels = [
			...models.slice(0, delIdx), // delete the idx
			...models.slice(delIdx + 1, Infinity)
		]
		this.setSettingOfProvider(providerName, 'models', newModels)
		return true
	}

}


registerSingleton(IVoidSettingsService, VoidSettingsService, InstantiationType.Eager);
