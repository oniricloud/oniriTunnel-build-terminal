cmake_minimum_required(VERSION 3.31)

find_package(cmake-pear REQUIRED PATHS node_modules/cmake-pear)

project(pear_appling C CXX ASM)


add_pear_appling(
  pear_appling
  ID "4h7qzfuec6rbb81d74hnyyda6ctxtmmudue68cmo83h79iyqhxyo"
  LINK "pear://4h7qzfuec6rbb81d74hnyyda6ctxtmmudue68cmo83h79iyqhxyo"
  NAME "Oniri"
  VERSION 1.1.0
  VERSION_COMPANY_NAME "OniriCloud"
  VERSION_PRODUCT_NAME "Oniri"
  AUTHOR "OniriCloud"
  DESCRIPTION "A secure, decentralized P2P tunneling application."

  MACOS_IDENTIFIER com.oniri.test
  MACOS_CATEGORY public.app-category.utilities
  MACOS_SIGNING_IDENTITY "-"
  # MACOS_SIGNING_IDENTITY "2718499D3FEA620C4E7BB467274BD07691CC2BDD"

  WINDOWS_SIGNING_SUBJECT "CN=TempBuildCert"
  WINDOWS_SIGNING_THUMBPRINT ""

  LINUX_CATEGORY Utility
)

# Override Windows subsystem to console for proper terminal output
if(WIN32)
  # Get current link flags as a string
  get_target_property(CURRENT_LINK_FLAGS pear_appling LINK_FLAGS)
  if(NOT CURRENT_LINK_FLAGS)
    set(CURRENT_LINK_FLAGS "")
  endif()
  
  # Replace /subsystem:windows with /subsystem:console
  string(REGEX REPLACE "/subsystem:windows" "/subsystem:console" NEW_LINK_FLAGS "${CURRENT_LINK_FLAGS}")
  
  # Set the modified flags back
  set_target_properties(pear_appling PROPERTIES LINK_FLAGS "${NEW_LINK_FLAGS}")
  
  # Also add console subsystem via link options to be sure
  target_link_options(
    pear_appling
    PRIVATE
      $<$<CONFIG:Release>:/subsystem:console>
      $<$<CONFIG:Debug>:/subsystem:console>
  )
endif()
