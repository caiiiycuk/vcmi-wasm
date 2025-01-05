set(VCMI_VERSION_MAJOR 1)
set(VCMI_VERSION_MINOR 6)
set(VCMI_VERSION_PATCH 3)
add_definitions(
	-DVCMI_VERSION_MAJOR=${VCMI_VERSION_MAJOR}
	-DVCMI_VERSION_MINOR=${VCMI_VERSION_MINOR}
	-DVCMI_VERSION_PATCH=${VCMI_VERSION_PATCH}
	-DVCMI_VERSION_STRING="${VCMI_VERSION_MAJOR}.${VCMI_VERSION_MINOR}.${VCMI_VERSION_PATCH}"
)
set(APP_SHORT_VERSION "${VCMI_VERSION_MAJOR}.${VCMI_VERSION_MINOR}")
if(NOT VCMI_VERSION_PATCH EQUAL 0)
	string(APPEND APP_SHORT_VERSION ".${VCMI_VERSION_PATCH}")
endif()
