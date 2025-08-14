import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    // Get the user ID to delete from the request body
    const { userId } = await request.json()
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'ID do usuário é obrigatório' },
        { status: 400 }
      )
    }

    // Call the database function to delete the user
    const { data, error } = await supabase.rpc('delete_user_account', {
      user_id_to_delete: userId
    })

    if (error) {
      console.error('Error calling delete_user_account:', error)
      return NextResponse.json(
        { success: false, error: 'Erro interno do servidor' },
        { status: 500 }
      )
    }

    // The function returns a JSON object with success/error info
    if (data.success) {
      return NextResponse.json(data)
    } else {
      return NextResponse.json(data, { status: 400 })
    }

  } catch (error) {
    console.error('Error in delete-user API:', error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
