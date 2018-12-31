import {getStore} from "./LauncherStore";
import AppDirectory from "../modules/AppDirectory";
import FDC3 from "../modules/FDC3";
const async = require("async");
let FDC3Client;
let appd;
let ToolbarStore;

export default {
	initialize,
	addApp,
	addNewFolder,
	addAppToFolder,
	removeAppFromFolder,
	renameFolder,
	deleteFolder,
	deleteApp,
	deleteTag,
	reorderFolders,
	getFolders,
	getFoldersList,
	getActiveFolderName,
	getActiveFolder,
	getSingleFolder,
	getAllAppsTags,
	getAllApps,
	getFormStatus,
	getSearchText,
	getSortBy,
	addTag,
	getTags,
	addPin,
	removePin,
	getApp
};

const MY_APPS = "My Apps";
const data = {};

function initialize(callback = Function.prototype) {
	FSBL.Clients.ConfigClient.getValue({ field: "finsemble.FD3CServer" }, function (err, FD3CServer) {
		FDC3Client = new FDC3({url: FD3CServer});
		appd = new AppDirectory(FDC3Client);
		
		const store = getStore();
		data.folders = store.values.appFolders.folders;
		data.foldersList = store.values.appFolders.list;
		data.apps = store.values.appDefinitions;
		data.tags = store.values.activeLauncherTags;
		data.activeFolder = store.values.activeFolder;
		data.filterText = store.values.filterText;
		data.sortBy = store.values.sortBy;
		data.isFormVisible = store.values.isFormVisible;
		data.configComponents = {};

		// Add listeners to keep our copy up to date
		store.addListener({field: "appFolders.folders"}, (err, dt) => data.folders = dt.value);
		store.addListener({field: "appFolders.list"}, (err, dt) => data.foldersList = dt.value);
		store.addListener({field: "appDefinitions"}, (err, dt) => data.apps = dt.value);
		store.addListener({field: "activeFolder"}, (err, dt) => data.activeFolder = dt.value);
		store.addListener({field: "isFormVisible"}, (err, dt) => data.isFormVisible = dt.value);
		store.addListener({field: "sortBy"}, (err, dt) => data.sortBy = dt.value);
		store.addListener({field: "activeLauncherTags"}, (err, dt) =>data.tags = dt.value);
		getToolbarStore((err, response) => {
			FSBL.Clients.RouterClient.subscribe("Finsemble.Service.State.launcherService", (err, response) => {
				loadInstalledComponentsFromStore(()=>{
				//We load our stored components(config driven) here
					loadInstalledConfigComponents(callback);
				});
			
			});
		});
	});
}
//This gets a specific app in FDC3 and returns the results
function getApp(appID, cb = Function.prototype) {
	appd.get(appID).then(app => cb(null, app)).catch(err => cb(err));
}
// Check to see if an app is already in our list of apps
function appInAppList(appName){
	let components  = Object.values(data.apps);
	for(let i = 0;i < components.length;i++){
		let component = components[i];
		if(component.name === appName)return true;
	}
	return false;
}
/**
 * Here we load apps from FDC3
 * @param {*} cb 
 */
function loadInstalledComponentsFromStore(cb = Function.prototype) {
	async.map(Object.values(data.apps), (component, componentDone) => {
		// Load FDC3 components here
		if (component.source && component.source === "FDC3") {
			// get the app info so we can load it into the launcher
			return getApp(component.appID, (err, app) => {
				if (err) {// don't want to kill this;
					deleteApp(component.appID);
					console.error("there was an error loading from FDC3", component, err);
					return componentDone();
				}
				// register the component with the launcher service
				FSBL.Clients.LauncherClient.registerComponent({
					componentType: component.name,
					manifest: app.manifest
				}, (err, response) => {
					componentDone(err);
				});
			});
		}
		// We'll load our user defined components here
		FSBL.Clients.LauncherClient.addUserDefinedComponent(component, (compAddErr) => {
			if (compAddErr) {
				console.warn("Failed to add new app");
			}
			componentDone(compAddErr);
		});
	}, (err) => {
		cb(err);
	});
}
// We load our apps that were loaded from the config.
function loadInstalledConfigComponents(cb = Function.prototype) {
	// Get the list of components from the launcher service
	FSBL.Clients.LauncherClient.getComponentList((err, componentList) => {
		let componentNameList = Object.keys(componentList);
		componentNameList.map(componentName => {
			// If the app is already in our list move on
			if(appInAppList(componentName))return;
			let component = componentList[componentName];
			// Make sure the app is launchable by user
			if (component.foreign.components["App Launcher"] && component.foreign.components["App Launcher"].launchableByUser) {
				data.configComponents[componentName] = {
					appID:componentName,
					icon:component.foreign.Toolbar && component.foreign.Toolbar.iconClass ? component.foreign.Toolbar.iconClass : null,
					name:componentName,
					source:"config",
					tags:[]
				};
			}
		});
		cb();
	});
}

function getToolbarStore(done) {
	FSBL.Clients.DistributedStoreClient.getStore({global: true, store: "Finsemble-Toolbar-Store"}, function (err, store) {
		ToolbarStore = store;
		store.getValue({field: "pins"}, function (err, pins) {
			data.pins = pins;
		});

		store.addListener({field: "pins"}, function (err, pins) {
			data.pins = pins;
		});
		done();
	});
}

function _setFolders(cb = Function.prototype) {
	getStore().setValue({
		field: "appFolders.folders",
		value: data.folders
	}, (error, data) => {
		if (error) {
			console.log("Failed to save modified folder list.");
		} else {
			cb();
		}
	});
}

function _setValue(field, value, cb) {
	getStore().setValue({
		field: field,
		value: value
	}, (error, data) => {
		if (error) {
			console.log("Failed to save. ", field);
		} else {
			cb && cb();
		}
	});
}

function addPin(pin) {
	//TODO: This logic may not work for dashboards. Might need to revisit.
	FSBL.Clients.LauncherClient.getComponentList((err, components) => {
		let componentToToggle;
		for (let i = 0; i < Object.keys(components).length; i++) {
			let componentName = Object.keys(components)[i];
			//pin name "Welcome" will not be found in component list with "Welcome Component".
			//Will check both for actual name, and for pin.name + Component against the list
			if (componentName === pin.name || componentName === pin.name + " Component") {
				componentToToggle = components[componentName];
			}
		}

		if (componentToToggle) {
			let componentType = componentToToggle.group || componentToToggle.component.type || pin.name;
			let fontIcon;
			try {
				if (componentToToggle.group) {
					fontIcon = "ff-ungrid";
				} else {
					fontIcon = componentToToggle.foreign.components.Toolbar.iconClass;
				}
			} catch (e) {
				fontIcon = "";
			}

			let imageIcon;
			try {
				imageIcon = componentToToggle.foreign.components.Toolbar.iconURL;
			} catch (e) {
				imageIcon = "";
			}


			let params = {addToWorkspace: true, monitor: "mine"};
			if (componentToToggle.component && componentToToggle.component.windowGroup) { params.groupName = componentToToggle.component.windowGroup; }
			var thePin = {
				type: "componentLauncher",
				label: pin.name,
				component: componentToToggle.group ? componentToToggle.list : componentType,
				fontIcon: fontIcon,
				icon: imageIcon,
				toolbarSection: "center",
				uuid: uuidv4(),
				params: params
			};
			ToolbarStore.setValue({field: "pins." + pin.name.replace(/[.]/g, "^DOT^"), value: thePin});
		}
	});

}

function removePin(pin) {
	ToolbarStore.removeValue({field: "pins." + pin.name.replace(/[.]/g, "^DOT^")});
}

function getFolders() {
	return data.folders;
}

function getFoldersList() {
	return data.foldersList;
}

function getAllApps() {
	let mergedApps = Object.assign({},data.apps,data.configComponents);;
	return mergedApps;
}

function getFormStatus() {
	return data.isFormVisible;
}

function getSingleFolder(folderName) {
	return data.folders[folderName];
}

function reorderFolders(destIndex, srcIndex) {
	const movedFolder = data.foldersList[destIndex];
	const remainingItems = data.foldersList.filter((item, index) => index !== destIndex);
	data.foldersList = [
		...remainingItems.slice(0, srcIndex),
		movedFolder,
		...remainingItems.slice(srcIndex)
	];
	_setValue("appFolders.list", data.foldersList);
	return data.foldersList;
}

function addApp(app = {}, cb) {
	const appID = (new Date()).getTime();
	const folder = data.activeFolder;
	data.apps[appID] = {
		appID,
		tags: app.tags.split(","),
		name: app.name,
		url: app.url,
		type: "component"
	};
	data.folders[MY_APPS].apps[appID] = data.apps[appID];
	data.folders[folder].apps[appID] = data.apps[appID];
	FSBL.Clients.LauncherClient.addUserDefinedComponent(data.apps[appID], (compAddErr) => {
		if (compAddErr) {
			//TODO: We need to handle the error here. If the component failed to add, we should probably fall back and not add to launcher
			console.warn("Failed to add new app");
			return;
		}
		// Save appDefinitions and then folders
		_setValue("appDefinitions", data.apps, () => {
			_setFolders();
			cb && cb();
		});
	});
}

function deleteApp(appID) {
	ToolbarStore.removeValue({field: "pins." + data.apps[appID].name.replace(/[.]/g, "^DOT^")}, (err, res) => {
		if (err) {
			//TODO: Need to gracefully handle this error. If the pin can't be removed, the app shouldn't either
			console.warn("Error removing pin for deleted app");
			return;
		}
		// Delete app from any folder that has it
		for (const key in data.folders) {
			if (data.folders[key].apps[appID]) {
				delete data.folders[key].apps[appID];
			}
		}
		// Delete app from the apps list
		delete data.apps[appID];
		// Save appDefinitions and then folders
		_setValue("appDefinitions", data.apps, () => {
			_setFolders();
		});
	});
}

function addNewFolder(name) {
	// Each new folder is given a number, lets store them here
	// to get the highest one and then increment
	const newFoldersNums = [0];
	// Find folders that have a name of "New folder" or "New folder #"
	data.foldersList.forEach((folder) => {
		const numbers = folder.match(/\d+/g) || [];
		newFoldersNums.push(Math.max.apply(this, numbers));
	});
	const highestFolderNumber = Math.max.apply(this, newFoldersNums);
	const folderName = name || `New folder ${highestFolderNumber + 1}`;
	const newFolder = {
		disableUserRemove: true,
		icon: "ff-folder",
		apps: []
	};
	data.folders[folderName] = newFolder;
	_setFolders(() => {
		// Update folders order if adding was successful
		data.foldersList.push(folderName);
		_setValue("appFolders.list", data.foldersList);
	});

}

function deleteFolder(folderName) {
	// Check if user is trying to delete the active folder
	if (folderName === data.activeFolder) {
		data.activeFolder = MY_APPS;
		_setValue("activeFolder", data.activeFolder);
	}

	delete data.folders[folderName] && _setFolders(() => {
		// Update the order of folders
		const index = data.foldersList.indexOf(folderName);
		data.foldersList.splice(index, 1);
		_setValue("appFolders.list", data.foldersList);
	});
}

function renameFolder(oldName, newName) {
	let oldFolder = data.folders[oldName];
	data.folders[newName] = oldFolder;
	_setFolders(() => {
		let indexOfOld = data.foldersList.findIndex((folderName) => {
			return folderName === oldName;
		});
		data.foldersList[indexOfOld] = newName;
		_setValue("appFolders.list", data.foldersList);
		delete data.folders[oldName];
	});
}

function addAppToFolder(folderName, app) {
	data.folders[folderName].apps[app.appID] = {
		name: app.name,
		appID: app.appID
	};
	_setFolders();
}

function removeAppFromFolder(folderName, app) {
	delete data.folders[folderName].apps[app.appID];
	_setFolders();
}

function getActiveFolder() {
	const folder = data.folders[data.activeFolder];
	Object.values(folder.apps).map((app) => {
		if (!data.apps[app.appID]) {
			app.tags = [];
		} else {
			app.tags = data.apps[app.appID].tags;
		}
	});
	//Need a name for the AppDefinition/AppActionsMenu rendering
	folder.name = data.activeFolder;
	return folder;
}

function getActiveFolderName() {
	return data.activeFolder;
}

function getSearchText() {
	return data.filterText;
}

function getSortBy() {
	return data.sortBy;
}

function getTags() {
	return data.tags;
}

function getAllAppsTags() {
	let tags = [];
	Object.values(data.apps).forEach((app) => {
		tags = tags.concat(app.tags);
	});
	// return unique ones only
	return tags.filter((tag, index) => {
		return tags.indexOf(tag) === index;
	});
}

function addTag(tag) {
	// Push new tag to list
	console.log("addTag",tag);
	data.tags.indexOf(tag) < 0 && data.tags.push(tag);
	// Update tags in store
	getStore().setValue({ field: "activeLauncherTags", value: data.tags });
}

function deleteTag(tag) {
	// Push new tag to list
	data.tags.splice(data.tags.indexOf(tag), 1);
	// Update tags in store
	console.log("deleteTag",data.tags);
	getStore().setValue({ field: "activeLauncherTags", value: data.tags });
}

function uuidv4() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
		var r = Math.random() * 16 | 0,
			v = c === "x" ? r : r & 0x3 | 0x8;
		return v.toString(16);
	});
}