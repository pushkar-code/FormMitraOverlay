package com.stronghold.overlay

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OverlayPackage : ReactPackage {
    private var moduleInstance: OverlayModule? = null

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        val module = OverlayModule(reactContext)
        moduleInstance = module
        instance = this
        return listOf(module)
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }

    companion object {
        private var instance: OverlayPackage? = null

        fun getModule(): OverlayModule? {
            return instance?.moduleInstance
        }
    }
}
