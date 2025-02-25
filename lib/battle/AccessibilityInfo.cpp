/*
 * AccessibilityInfo.cpp, part of VCMI engine
 *
 * Authors: listed in file AUTHORS in main folder
 *
 * License: GNU General Public License v2.0 or later
 * Full text of license available in license.txt file, in main folder
 *
 */
#include "StdInc.h"
#include "AccessibilityInfo.h"
#include "BattleHex.h"
#include "Unit.h"
#include "../GameConstants.h"

VCMI_LIB_NAMESPACE_BEGIN

bool AccessibilityInfo::tileAccessibleWithGate(const BattleHex & tile, BattleSide side) const
{
	//at(otherHex) != EAccessibility::ACCESSIBLE && (at(otherHex) != EAccessibility::GATE || side != BattleSide::DEFENDER)
	const auto & accessibility = at(tile.toInt());

	if(accessibility == EAccessibility::ALIVE_STACK)
	{
		if(!destructibleEnemyTurns)
			return false;

		return destructibleEnemyTurns->at(tile.toInt()) >= 0;
	}

	if(accessibility != EAccessibility::ACCESSIBLE)
		if(accessibility != EAccessibility::GATE || side != BattleSide::DEFENDER)
			return false;

	return true;
}

bool AccessibilityInfo::accessible(const BattleHex & tile, const battle::Unit * stack) const
{
	return accessible(tile, stack->doubleWide(), stack->unitSide());
}

bool AccessibilityInfo::accessible(const BattleHex & tile, bool doubleWide, BattleSide side) const
{
	// All hexes that stack would cover if standing on tile have to be accessible.
	//do not use getHexes for speed reasons
	if(!tile.isValid())
		return false;
	if(!tileAccessibleWithGate(tile, side))
		return false;

	if(doubleWide)
	{
		auto otherHex = battle::Unit::occupiedHex(tile, doubleWide, side);
		if(!otherHex.isValid())
			return false;
		if(!tileAccessibleWithGate(otherHex, side))
			return false;
	}

	return true;
}

VCMI_LIB_NAMESPACE_END
