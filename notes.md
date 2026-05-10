para crear usuarios:

node scripts/manage-users.mjs list                              # ver todos
node scripts/manage-users.mjs create email pass rol [nombre]   # crear
node scripts/manage-users.mjs passwd email nuevaPass           # cambiar contraseña
node scripts/manage-users.mjs delete email                     # eliminar