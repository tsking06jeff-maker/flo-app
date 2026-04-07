import { supabase } from './Supabase.js'

async function loadCategories() {
  const { data, error } = await supabase.from('categories').select('*')

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Categories:', data)
  document.getElementById('categories').innerHTML = 
    `<pre>${JSON.stringify(data, null, 2)}</pre>`
}

loadCategories()