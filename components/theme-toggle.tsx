'use client'

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Switch } from "@/components/ui/switch"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  // Only show the UI after mounting to prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])
  
  if (!mounted) {
    return <div className="flex items-center gap-2 h-6"></div> // Placeholder with same height
  }

  return (
    <div className="flex items-center gap-2">
      <Sun className="h-4 w-4" />
      <Switch 
        checked={theme === 'dark'} 
        onCheckedChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <Moon className="h-4 w-4" />
    </div>
  )
}

