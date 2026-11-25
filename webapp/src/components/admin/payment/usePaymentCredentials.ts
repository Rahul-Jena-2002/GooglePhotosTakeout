import { useEffect, useState } from "react"
import { doc, onSnapshot, setDoc } from "firebase/firestore"
import { db } from "../../../firebase"
import { decrypt, encrypt, deriveKeyFromPassword } from "../../../lib/crypto"
import { useToastStore } from "../../../store/useToastStore"

interface GatewayConfig {
  id: string
  label: string
  description: string
  firestorePath: string
  firestoreField: string
  placeholder: string
  sensitive: boolean
}

export const GATEWAY_CREDENTIALS: Record<string, GatewayConfig[]> = {
  dodo: [
    {
      id: "dodo_api_key",
      label: "Dodo Live API Key",
      description: "Live secret API key for Dodo Payments. Used by backend to update products & sync discounts.",
      firestorePath: "settings/system",
      firestoreField: "dodo_api_key",
      placeholder: "Live API Key from Dodo Dashboard",
      sensitive: true,
    },
    {
      id: "dodo_test_api_key",
      label: "Dodo Test API Key",
      description: "Test/sandbox secret API key for Dodo Payments.",
      firestorePath: "settings/system",
      firestoreField: "dodo_test_api_key",
      placeholder: "Test API Key from Dodo Dashboard",
      sensitive: true,
    },
    {
      id: "dodo_webhook_key",
      label: "Dodo Webhook Signing Secret",
      description: "Webhook secret used to verify incoming Dodo payments.",
      firestorePath: "settings/secure",
      firestoreField: "dodo_webhook_key",
      placeholder: "whsec_xxxxxxxxxxxxxxxxxxxx",
      sensitive: true,
    }
  ],
  stripe: [
    {
      id: "stripe_secret_key",
      label: "Stripe Live Secret Key",
      description: "Stripe secret key used server-side to initiate sessions.",
      firestorePath: "settings/system",
      firestoreField: "stripe_secret_key",
      placeholder: "sk_live_...",
      sensitive: true,
    },
    {
      id: "stripe_test_secret_key",
      label: "Stripe Test Secret Key",
      description: "Stripe test key used for sandbox mode testing.",
      firestorePath: "settings/system",
      firestoreField: "stripe_test_secret_key",
      placeholder: "sk_test_51xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      sensitive: true,
    },
    {
      id: "stripe_webhook_secret",
      label: "Stripe Webhook Signing Secret",
      description: "Stripe webhook endpoint signing secret to prevent spoofing.",
      firestorePath: "settings/secure",
      firestoreField: "stripe_webhook_secret",
      placeholder: "whsec_xxxxxxxxxxxxxxxxxxxx",
      sensitive: true,
    }
  ],
  lemonsqueezy: [
    {
      id: "lemonsqueezy_api_key",
      label: "Lemon Squeezy API Key",
      description: "API Key for authentication with Lemon Squeezy API.",
      firestorePath: "settings/system",
      firestoreField: "lemonsqueezy_api_key",
      placeholder: "ls_xxxxxx...",
      sensitive: true,
    },
    {
      id: "lemonsqueezy_webhook_secret",
      label: "Lemon Squeezy Webhook Secret",
      description: "Secret string configured in Lemon Squeezy webhook panel.",
      firestorePath: "settings/secure",
      firestoreField: "lemonsqueezy_webhook_secret",
      placeholder: "your-signing-secret",
      sensitive: true,
    }
  ],
  paddle: [
    {
      id: "paddle_vendor_id",
      label: "Paddle Vendor / Seller ID",
      description: "Public seller ID provided in your Paddle developer settings.",
      firestorePath: "settings/system",
      firestoreField: "paddle_vendor_id",
      placeholder: "12345",
      sensitive: false,
    },
    {
      id: "paddle_api_key",
      label: "Paddle API Key",
      description: "Secret API key generated in vendor dashboard.",
      firestorePath: "settings/system",
      firestoreField: "paddle_api_key",
      placeholder: "paddle_live_xxxx...",
      sensitive: true,
    },
    {
      id: "paddle_webhook_secret",
      label: "Paddle Webhook Secret key",
      description: "Secret key used to verify Paddle webhook signatures.",
      firestorePath: "settings/secure",
      firestoreField: "paddle_webhook_secret",
      placeholder: "p_whsec_xxxx...",
      sensitive: true,
    }
  ]
}

export function usePaymentCredentials() {
  // --- MEK Encryption states ---
  const [mek, setMek] = useState<string>("")
  const [mekInput, setMekInput] = useState<string>("")
  const [mekKey, setMekKey] = useState<CryptoKey | null>(null)

  // --- Credentials State ---
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({})
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [savingCreds, setSavingCreds] = useState<string | null>(null)

  const toggleVisibility = (id: string) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const [gatewayApiKey, setGatewayApiKey] = useState("")
  const [cloudFunctionUrl, setCloudFunctionUrl] = useState("")

  // --- Restore MEK from sessionStorage ---
  useEffect(() => {
    const restoreMek = async () => {
      const savedMek = sessionStorage.getItem("tf_mek")
      if (savedMek) {
        try {
          const salt = new Uint8Array(16)
          const { key } = await deriveKeyFromPassword(savedMek, salt)
          setMekKey(key)
          setMek(savedMek)
        } catch (err) {
          console.error("Failed to restore MEK:", err)
        }
      }
    }
    restoreMek()
  }, [])

  useEffect(() => {
    // 5. System secrets (dodo_api_key, gateway_api_key)
    const unsubSystem = onSnapshot(doc(db, "settings", "system"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setGatewayApiKey(data.gateway_api_key || "")
        setCloudFunctionUrl(data.cloud_function_url || "")
        // Populate credentials state
        setCredentials(prev => ({
          ...prev,
          dodo_api_key: data.dodo_api_key || "",
          dodo_test_api_key: data.dodo_test_api_key || "",
          stripe_secret_key: data.stripe_secret_key || "",
          stripe_test_secret_key: data.stripe_test_secret_key || "",
          lemonsqueezy_api_key: data.lemonsqueezy_api_key || "",
          paddle_vendor_id: data.paddle_vendor_id || "",
          paddle_api_key: data.paddle_api_key || "",
        }))
      }
    })

    // 6. Secure secrets (webhook secrets)
    const unsubSecure = onSnapshot(doc(db, "settings", "secure"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setCredentials(prev => ({
          ...prev,
          dodo_webhook_key: data.dodo_webhook_key || "",
          stripe_webhook_secret: data.stripe_webhook_secret || "",
          lemonsqueezy_webhook_secret: data.lemonsqueezy_webhook_secret || "",
          paddle_webhook_secret: data.paddle_webhook_secret || "",
        }))
      }
    })

    return () => {
      unsubSystem()
      unsubSecure()
    }
  }, [])

  // --- Decrypt dynamic credentials when MEK changes ---
  useEffect(() => {
    const decryptAll = async () => {
      const decMap: Record<string, string> = {}
      for (const [id, value] of Object.entries(credentials)) {
        const def = Object.values(GATEWAY_CREDENTIALS).flat().find(x => x.id === id)
        if (def && def.sensitive && value.startsWith("enc:v1:") && mekKey) {
          try {
            decMap[id] = await decrypt(value, mekKey)
          } catch (e) {
            decMap[id] = ""
          }
        }
      }
      setDecryptedValues(decMap)
    }
    if (mekKey) {
      decryptAll()
    } else {
      setDecryptedValues({})
    }
  }, [credentials, mekKey])

  const handleMekSubmit = async () => {
    if (!mekInput.trim()) return
    try {
      const val = mekInput.trim()
      const salt = new Uint8Array(16)
      const { key } = await deriveKeyFromPassword(val, salt)
      setMekKey(key)
      setMek(val)
      sessionStorage.setItem("tf_mek", val)
      setMekInput("")
      useToastStore.getState().addToast("Master key loaded. Confirm it matches the server key before saving credentials.", "info", 7000)
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to process MEK: " + err.message, "error")
    }
  }

  const handleMekClear = () => {
    setMek("")
    setMekKey(null)
    setMekInput("")
    sessionStorage.removeItem("tf_mek")
    setDecryptedValues({})
    useToastStore.getState().addToast("Session lock applied. Credentials hidden.", "info")
  }

  const handleSaveCredential = async (def: GatewayConfig, rawVal: string) => {
    setSavingCreds(def.id)
    try {
      let valToSave = rawVal.trim()
      if (def.sensitive && valToSave) {
        if (!valToSave.startsWith("enc:v1:")) {
          if (mekKey) {
            valToSave = await encrypt(valToSave, mekKey)
          } else {
            useToastStore.getState().addToast("Unlock the master encryption key before saving a sensitive value.", "error")
            return
          }
        }
      }
      const paths = def.firestorePath.split("/")
      await setDoc(doc(db, paths[0], paths[1]), {
        [def.firestoreField]: valToSave
      }, { merge: true })
      useToastStore.getState().addToast(`Saved key configuration for ${def.label}`, "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save credentials: " + err.message, "error")
    } finally {
      setSavingCreds(null)
    }
  }

  return {
    mek,
    mekInput,
    setMekInput,
    mekKey,
    credentials,
    setCredentials,
    decryptedValues,
    visibleKeys,
    savingCreds,
    toggleVisibility,
    gatewayApiKey,
    cloudFunctionUrl,
    setCloudFunctionUrl,
    handleMekSubmit,
    handleMekClear,
    handleSaveCredential,
  }
}
