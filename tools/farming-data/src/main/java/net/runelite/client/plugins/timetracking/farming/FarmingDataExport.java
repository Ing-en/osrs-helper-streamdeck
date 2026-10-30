package net.runelite.client.plugins.timetracking.farming;

import com.google.gson.GsonBuilder;
import java.io.FileWriter;
import java.io.Writer;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import net.runelite.client.RuneLiteProperties;
import net.runelite.client.plugins.timetracking.Tab;

/**
 * Dumps the tables behind RuneLite's Time Tracking farming predictions (BSD-2-Clause, Copyright (c) 2018 Abex and
 * RuneLite contributors) so the Stream Deck plugin can make the same predictions from RuneLite's saved config.
 * Lives in RuneLite's package because these classes are package-private.
 */
public class FarmingDataExport
{
	private static final int MAX_VARBIT_VALUE = 255;

	public static void main(String[] args) throws Exception
	{
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("source", "Generated from RuneLite " + RuneLiteProperties.getVersion()
			+ " Time Tracking (BSD-2-Clause, Copyright (c) 2018 Abex and RuneLite contributors). Do not edit; run tools/farming-data.");

		Map<String, Object> implementations = new TreeMap<>();
		for (PatchImplementation impl : PatchImplementation.values())
		{
			Map<String, Object> states = new LinkedHashMap<>();
			for (int value = 0; value <= MAX_VARBIT_VALUE; value++)
			{
				PatchState state = impl.forVarbitValue(value);
				if (state != null)
				{
					states.put(Integer.toString(value), Arrays.asList(
						state.getProduce().name(), state.getCropState().name(), state.getStage(), state.getStages(), state.getTickRate()));
				}
			}

			Map<String, Object> entry = new LinkedHashMap<>();
			entry.put("tab", impl.getTab() == null ? null : impl.getTab().name());
			entry.put("healthCheck", impl.isHealthCheckRequired());
			entry.put("states", states);
			implementations.put(impl.name(), entry);
		}
		out.put("implementations", implementations);

		Map<String, Object> produce = new TreeMap<>();
		for (Produce p : Produce.values())
		{
			Map<String, Object> entry = new LinkedHashMap<>();
			entry.put("name", p.getName());
			entry.put("itemId", p.getItemID());
			entry.put("impl", p.getPatchImplementation() == null ? null : p.getPatchImplementation().name());
			produce.put(p.name(), entry);
		}
		out.put("produce", produce);

		FarmingWorld world = new FarmingWorld();
		Map<String, Object> patches = new TreeMap<>();
		Map<String, List<String>> tabs = new LinkedHashMap<>();
		for (Tab tab : Tab.FARMING_TABS)
		{
			Set<FarmingPatch> tabPatches = world.getTabs().get(tab);
			if (tabPatches == null)
			{
				continue;
			}
			tabs.put(tab.name(), tabPatches.stream()
				.sorted(Comparator.comparing(FarmingPatch::configKey))
				.map(FarmingPatch::configKey)
				.collect(Collectors.toList()));
			for (FarmingPatch patch : tabPatches)
			{
				patches.put(patch.configKey(), patch(patch));
			}
		}
		for (FarmingPatch patch : world.getFarmingGuildRegion().getPatches())
		{
			patches.put(patch.configKey(), patch(patch));
		}
		out.put("tabs", tabs);
		out.put("patches", patches);
		out.put("farmingGuild", Arrays.stream(world.getFarmingGuildRegion().getPatches())
			.map(FarmingPatch::configKey)
			.collect(Collectors.toList()));

		try (Writer writer = new FileWriter(args[0]))
		{
			new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(out, writer);
		}
		System.out.println("Wrote " + args[0]);
	}

	private static Map<String, Object> patch(FarmingPatch patch)
	{
		Map<String, Object> entry = new LinkedHashMap<>();
		entry.put("impl", patch.getImplementation().name());
		entry.put("region", patch.getRegion().getName());
		entry.put("name", patch.getName());
		return entry;
	}
}
